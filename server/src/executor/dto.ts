import { IsArray, IsObject, IsOptional, IsString } from 'class-validator';

export class KeyValueDto {
  @IsString()
  key!: string;

  @IsOptional()
  @IsString()
  value?: string;

  @IsOptional()
  enabled?: boolean;
}

// A single multipart/form-data part (text or file)
export class MultipartPartDto {
  @IsString()
  key!: string;

  @IsOptional()
  @IsString()
  type?: string; // 'text' | 'file'

  @IsOptional()
  @IsString()
  value?: string; // text part value

  @IsOptional()
  @IsString()
  filename?: string; // file part filename

  @IsOptional()
  @IsString()
  contentType?: string; // file part Content-Type

  @IsOptional()
  @IsString()
  data?: string; // file part content (base64)

  @IsOptional()
  enabled?: boolean;
}

// Execution request: the request spec assembled by the frontend (variable substitution happens on the server).
export class ExecuteDto {
  // Optional value to link the history entry to a specific endpoint
  @IsOptional()
  @IsString()
  endpointId?: string;

  @IsString()
  method!: string;

  // The full URL (baseUrl + path), e.g. https://api.example.com/orders/1
  @IsString()
  url!: string;

  @IsOptional()
  @IsArray()
  headers?: KeyValueDto[];

  @IsOptional()
  @IsArray()
  queryParams?: KeyValueDto[];

  @IsOptional()
  @IsString()
  bodyType?: string; // none | json | form | raw | multipart

  @IsOptional()
  @IsString()
  body?: string;

  // multipart/form-data parts. A file part's data is base64.
  @IsOptional()
  @IsArray()
  multipart?: MultipartPartDto[];

  @IsOptional()
  @IsString()
  authType?: string; // none | bearer | basic | apikey

  @IsOptional()
  @IsObject()
  authConfig?: Record<string, any>;

  // Link this execution to a specific scenario run
  @IsOptional()
  @IsString()
  scenarioRunId?: string;
}
