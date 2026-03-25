function sendJson(res: any, status: number, payload: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

async function readRawBody(req: any) {
  if (typeof req.body === 'string') {
    return req.body
  }

  if (req.body && typeof req.body === 'object') {
    return JSON.stringify(req.body)
  }

  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
  }

  return Buffer.concat(chunks).toString('utf-8')
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return sendJson(res, 405, { error: { message: 'Method not allowed' } })
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    return sendJson(res, 503, {
      error: {
        message: 'Missing OPENAI_API_KEY on server.',
        type: 'configuration_error',
      },
    })
  }

  let payload: Record<string, unknown>
  try {
    const rawBody = await readRawBody(req)
    payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {}
  } catch {
    return sendJson(res, 400, {
      error: {
        message: 'Invalid JSON body.',
        type: 'invalid_request_error',
      },
    })
  }

  if (!payload.model) {
    payload.model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o'
  }

  try {
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    res.statusCode = upstream.status
    const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8'
    res.setHeader('Content-Type', contentType)

    const cacheControl = upstream.headers.get('cache-control')
    if (cacheControl) {
      res.setHeader('Cache-Control', cacheControl)
    }

    if (!upstream.body) {
      return res.end()
    }

    const reader = upstream.body.getReader()
    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        break
      }

      res.write(Buffer.from(value))
    }

    return res.end()
  } catch (error) {
    return sendJson(res, 502, {
      error: {
        message: error instanceof Error ? error.message : 'OpenAI upstream request failed',
        type: 'upstream_error',
      },
    })
  }
}
