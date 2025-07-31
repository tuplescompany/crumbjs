export const apiDocs = {
  openapi: '3.1.0',
  info: { version: '1.0.0', title: 'API', description: 'API Documentation' },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer' },
      basicAuth: { type: 'http', scheme: 'basic' },
    },
    schemas: {},
    parameters: {},
  },
  paths: {
    '/api/file': {
      post: {
        operationId: 'postApiFile',
        tags: ['Uncategorized'],
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: {
                    type: 'string',
                    format: 'binary',
                    contentMediaType: 'application/octet-stream',
                  },
                },
                required: ['file'],
              },
            },
          },
        },
        responses: {},
      },
    },
    '/api/hello/{name}': {
      get: {
        operationId: 'getApiHelloByName',
        tags: ['Uncategorized'],
        parameters: [
          {
            schema: { type: 'string' },
            required: true,
            name: 'name',
            in: 'path',
          },
        ],
        responses: {},
      },
    },
    '/api/hello': {
      get: {
        operationId: 'getApiHello',
        tags: ['Uncategorized'],
        parameters: [
          {
            schema: { type: 'string' },
            required: true,
            name: 'name',
            in: 'query',
          },
        ],
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { first: { type: 'number' } },
                  required: ['first'],
                },
              },
            },
          },
          '400': {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                    status: { type: 'number', enum: [400] },
                  },
                  required: ['message', 'status'],
                },
              },
            },
          },
          '500': {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                    status: { type: 'number', enum: [500] },
                  },
                  required: ['message', 'status'],
                },
              },
            },
          },
        },
      },
      post: {
        operationId: 'postApiHello',
        tags: ['Uncategorized'],
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', minLength: 3 },
                  file: { type: 'string', format: 'binary' },
                },
                required: ['name', 'file'],
              },
            },
          },
        },
        responses: {},
      },
    },
  },
} as const;
