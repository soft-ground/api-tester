import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { VariablesService } from './variables.service';
import {
  CreateEnvironmentDto,
  CreateVariableRuleDto,
  PreviewDto,
  UpdateEnvironmentDto,
  UpdateVariableRuleDto,
} from './dto';

@Controller()
export class VariablesController {
  constructor(private readonly service: VariablesService) {}

  // ---- Environments ----
  @Get('environments')
  listEnvironments() {
    return this.service.listEnvironments();
  }

  @Post('environments')
  createEnvironment(@Body() dto: CreateEnvironmentDto) {
    return this.service.createEnvironment(dto);
  }

  @Post('environments/reorder')
  reorderEnvironments(@Body() body: { ids: string[] }) {
    return this.service.reorderEnvironments(body.ids ?? []);
  }

  // Save a value captured from a response as an active environment variable
  @Post('environments/active/variables')
  setActiveVar(@Body() body: { name: string; value: string }) {
    return this.service.setActiveEnvVariable(body.name, body.value);
  }

  @Patch('environments/:id')
  updateEnvironment(
    @Param('id') id: string,
    @Body() dto: UpdateEnvironmentDto,
  ) {
    return this.service.updateEnvironment(id, dto);
  }

  @Post('environments/:id/activate')
  activate(@Param('id') id: string) {
    return this.service.activateEnvironment(id);
  }

  @Delete('environments/:id')
  deleteEnvironment(@Param('id') id: string) {
    return this.service.deleteEnvironment(id);
  }

  // ---- Variable Rules ----
  @Get('variables')
  listRules() {
    return this.service.listRules();
  }

  // Variable name list for autocomplete (active env variables + rule names)
  @Get('variables/available')
  available() {
    return this.service.getAvailableNames();
  }

  @Post('variables')
  createRule(@Body() dto: CreateVariableRuleDto) {
    return this.service.createRule(dto);
  }

  @Post('variables/preview')
  preview(@Body() dto: PreviewDto) {
    return this.service.preview(dto);
  }

  @Post('variables/reorder')
  reorderRules(@Body() body: { ids: string[] }) {
    return this.service.reorderRules(body.ids ?? []);
  }

  @Patch('variables/:id')
  updateRule(@Param('id') id: string, @Body() dto: UpdateVariableRuleDto) {
    return this.service.updateRule(id, dto);
  }

  @Delete('variables/:id')
  deleteRule(@Param('id') id: string) {
    return this.service.deleteRule(id);
  }
}
