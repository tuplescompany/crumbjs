export const api = {
  '/api/file': {
    POST: {
      request: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          body: {
            type: 'object',
            properties: {
              file: {
                type: 'string',
                format: 'binary',
                contentMediaType: 'application/octet-stream',
                contentEncoding: 'binary',
              },
            },
            required: ['file'],
            additionalProperties: false,
          },
          params: {},
          query: {},
          headers: {},
        },
        required: ['body'],
        additionalProperties: false,
      },
      responses: {},
    },
  },
  '/api/hello/:name': {
    GET: {
      request: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          body: {},
          params: {
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
            additionalProperties: false,
          },
          query: {},
          headers: {},
        },
        required: ['params'],
        additionalProperties: false,
      },
      responses: {},
    },
  },
  '/api/hello': {
    GET: {
      request: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          body: {},
          params: {},
          query: {
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
            additionalProperties: false,
          },
          headers: {},
        },
        required: ['query'],
        additionalProperties: false,
      },
      responses: {
        '200': {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          properties: { first: { type: 'number' } },
          required: ['first'],
          additionalProperties: false,
        },
        '400': {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          properties: {
            message: { type: 'string' },
            status: { type: 'number', const: 400 },
          },
          required: ['message', 'status'],
          additionalProperties: false,
        },
        '500': {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          properties: {
            message: { type: 'string' },
            status: { type: 'number', const: 500 },
          },
          required: ['message', 'status'],
          additionalProperties: false,
        },
      },
    },
    POST: {
      request: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          body: {
            type: 'object',
            properties: {
              name: { type: 'string', minLength: 3 },
              file: {
                type: 'string',
                format: 'binary',
                contentEncoding: 'binary',
              },
            },
            required: ['name', 'file'],
            additionalProperties: false,
          },
          params: {},
          query: {},
          headers: {},
        },
        required: ['body'],
        additionalProperties: false,
      },
      responses: {},
    },
  },
} as const;
