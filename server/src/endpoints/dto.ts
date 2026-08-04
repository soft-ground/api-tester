import {
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export class CreateCollectionDto {
  @IsString()
  name!: string;

  // Parent group id. null means top level. (ValidateIf to allow null.)
  @IsOptional()
  @ValidateIf((o) => o.parentId !== null)
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsInt()
  order?: number;
}

export class UpdateCollectionDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  order?: number;
}

// Move a group (change parent + order). parentId=null moves it to the top level.
export class MoveCollectionDto {
  @IsOptional()
  @ValidateIf((o) => o.parentId !== null)
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsInt()
  order?: number;
}

// key/value pair (headers, query parameters)
export class KeyValueDto {
  @IsString()
  key!: string;

  @IsOptional()
  @IsString()
  value?: string;

  @IsOptional()
  enabled?: boolean;
}

export class CreateEndpointDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  collectionId?: string | null;

  @IsOptional()
  @IsString()
  method?: string;

  @IsOptional()
  @IsString()
  baseUrl?: string;

  @IsOptional()
  @IsString()
  path?: string;

  @IsOptional()
  @IsArray()
  headers?: KeyValueDto[];

  @IsOptional()
  @IsArray()
  queryParams?: KeyValueDto[];

  @IsOptional()
  @IsString()
  bodyType?: string;

  @IsOptional()
  @IsString()
  bodyTemplate?: string | null;

  @IsOptional()
  @IsString()
  authType?: string;

  @IsOptional()
  @IsObject()
  authConfig?: Record<string, unknown>;
}

export class UpdateEndpointDto extends CreateEndpointDto {
  @IsOptional()
  @IsString()
  declare name: string;
}
