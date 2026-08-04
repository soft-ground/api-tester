import { IsObject, IsOptional, IsString, IsBoolean } from 'class-validator';

// ---- Environment ----
export class CreateEnvironmentDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateEnvironmentDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ---- VariableRule ----
export class CreateVariableRuleDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  type?: string; // fixed | sequence | expression | timestamp | uuid | random

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;
}

export class UpdateVariableRuleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;

  // Used e.g. to reset a sequence current value
  @IsOptional()
  @IsObject()
  state?: Record<string, any>;
}

export class PreviewDto {
  // Rule preview: evaluate a saved rule by id, or evaluate ad-hoc with type+config
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;
}
