import { Module } from '@nestjs/common';
import { VariablesController } from './variables.controller';
import { VariablesService } from './variables.service';

@Module({
  controllers: [VariablesController],
  providers: [VariablesService],
  exports: [VariablesService],
})
export class VariablesModule {}
