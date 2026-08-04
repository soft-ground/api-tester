import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ScenariosService } from './scenarios.service';

@Controller('scenarios')
export class ScenariosController {
  constructor(private readonly service: ScenariosService) {}

  @Get()
  list() {
    return this.service.listScenarios();
  }

  @Post()
  create(@Body() dto: { name: string; desc?: string }) {
    return this.service.createScenario(dto);
  }

  // Run history (specific routes before :id)
  @Get('runs/:runId')
  getRun(@Param('runId') runId: string) {
    return this.service.getRun(runId);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.getScenario(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: { name?: string; desc?: string; data?: unknown },
  ) {
    return this.service.updateScenario(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.deleteScenario(id);
  }

  @Get(':id/runs')
  listRuns(@Param('id') id: string) {
    return this.service.listRuns(id);
  }

  @Post(':id/run')
  run(@Param('id') id: string) {
    return this.service.run(id);
  }

  // ---- steps ----
  @Post(':id/steps')
  addStep(@Param('id') id: string, @Body() dto: { endpointId: string }) {
    return this.service.addStep(id, dto);
  }

  @Post(':id/steps/reorder')
  reorderSteps(@Body() body: { ids: string[] }) {
    return this.service.reorderSteps(body.ids ?? []);
  }

  @Patch('steps/:stepId')
  updateStep(
    @Param('stepId') stepId: string,
    @Body() dto: { extracts?: unknown; asserts?: unknown; overrides?: unknown },
  ) {
    return this.service.updateStep(stepId, dto);
  }

  @Delete('steps/:stepId')
  deleteStep(@Param('stepId') stepId: string) {
    return this.service.deleteStep(stepId);
  }
}
