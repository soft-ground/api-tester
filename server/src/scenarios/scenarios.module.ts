import { Module } from '@nestjs/common';
import { ScenariosController } from './scenarios.controller';
import { ScenariosService } from './scenarios.service';
import { ExecutorModule } from '../executor/executor.module';
import { VariablesModule } from '../variables/variables.module';

@Module({
  imports: [ExecutorModule, VariablesModule],
  controllers: [ScenariosController],
  providers: [ScenariosService],
})
export class ScenariosModule {}
