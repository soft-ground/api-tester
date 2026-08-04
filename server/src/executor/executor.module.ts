import { Module } from '@nestjs/common';
import { ExecutorController } from './executor.controller';
import { ExecutorService } from './executor.service';
import { VariablesModule } from '../variables/variables.module';

@Module({
  imports: [VariablesModule],
  controllers: [ExecutorController],
  providers: [ExecutorService],
  exports: [ExecutorService],
})
export class ExecutorModule {}
