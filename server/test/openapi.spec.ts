import { describe, it, expect } from 'vitest';
import { parseOpenApi } from '../src/import/openapi';
import { stripJsonComments } from '../src/executor/jsonc';

describe('parseOpenApi (OpenAPI 3.x)', () => {
  const spec = {
    openapi: '3.0.0',
    info: { title: 'My API' },
    servers: [{ url: 'https://api.example.com/v1/' }],
    paths: {
      '/users': {
        get: {
          summary: 'List users',
          tags: ['users'],
          parameters: [
            { name: 'q', in: 'query' },
            { name: 'X-Tok', in: 'header' },
          ],
        },
        post: {
          operationId: 'createUser',
          tags: ['users'],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    age: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  const { title, endpoints } = parseOpenApi(spec);

  it('title + baseUrl (trailing slash removed)', () => {
    expect(title).toBe('My API');
    expect(endpoints).toHaveLength(2);
    expect(endpoints[0].baseUrl).toBe('https://api.example.com/v1');
  });

  it('GET: name/tag/query & header params, no body', () => {
    const get = endpoints.find((e) => e.method === 'GET')!;
    expect(get.name).toBe('List users');
    expect(get.tag).toBe('users');
    expect(get.path).toBe('/users');
    expect(get.queryParams).toEqual([{ key: 'q', value: '', enabled: false }]);
    expect(get.headers).toEqual([{ key: 'X-Tok', value: '', enabled: true }]);
    expect(get.bodyType).toBe('none');
  });

  it('POST: requestBody → JSON sample body', () => {
    const post = endpoints.find((e) => e.method === 'POST')!;
    expect(post.name).toBe('createUser');
    expect(post.bodyType).toBe('json');
    expect(JSON.parse(post.bodyTemplate!)).toEqual({ name: '', age: 0 });
  });
});

describe('required/optional auto-annotation', () => {
  const bodyOf = (schema: any) => {
    const { endpoints } = parseOpenApi({
      openapi: '3.0.0',
      info: { title: 'A' },
      paths: {
        '/v': {
          post: {
            operationId: 'op',
            requestBody: { content: { 'application/json': { schema } } },
          },
        },
      },
    });
    return endpoints[0].bodyTemplate!;
  };

  it('annotates top-level primitives when required is declared', () => {
    const body = bodyOf({
      type: 'object',
      required: ['mainAccountNo', 'depositorName'],
      properties: {
        Header: { type: 'object', properties: { apiName: { type: 'string' } } },
        mainAccountNo: { type: 'string' },
        depositorName: { type: 'string' },
        memo: { type: 'string' },
      },
    });
    expect(body).toMatch(/"mainAccountNo": "",?\s+\/\/ required/);
    expect(body).toMatch(/"depositorName": "",?\s+\/\/ required/);
    expect(body).toMatch(/"memo": "",?\s+\/\/ optional/);
    // nested object value is not annotated
    expect(body).not.toMatch(/"Header": \{\s+\/\//);
    // still valid JSON once comments are stripped
    expect(JSON.parse(stripJsonComments(body))).toEqual({
      Header: { apiName: '' },
      mainAccountNo: '',
      depositorName: '',
      memo: '',
    });
  });

  it('adds NO comments when the schema declares no required info', () => {
    const body = bodyOf({
      type: 'object',
      properties: { a: { type: 'string' }, b: { type: 'integer' } },
    });
    expect(body).not.toContain('//');
    expect(JSON.parse(body)).toEqual({ a: '', b: 0 });
  });

  it('treats a malformed (non-array) required as no info', () => {
    const body = bodyOf({
      type: 'object',
      required: 'name',
      properties: { name: { type: 'string' } },
    } as any);
    expect(body).not.toContain('//');
    expect(JSON.parse(body)).toEqual({ name: '' });
  });
});

describe('parseOpenApi (Swagger 2.0 baseUrl)', () => {
  it('host + basePath + scheme combination', () => {
    const { endpoints } = parseOpenApi({
      swagger: '2.0',
      host: 'api.x.com',
      basePath: '/v2',
      schemes: ['https'],
      info: { title: 'S2' },
      paths: { '/ping': { get: { summary: 'ping' } } },
    });
    expect(endpoints[0].baseUrl).toBe('https://api.x.com/v2');
  });
});
