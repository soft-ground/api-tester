import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { EndpointsModule } from './endpoints/endpoints.module';
import { ExecutorModule } from './executor/executor.module';
import { HistoryModule } from './history/history.module';
import { VariablesModule } from './variables/variables.module';
import { BackupModule } from './backup/backup.module';
import { ScenariosModule } from './scenarios/scenarios.module';
import { ImportModule } from './import/import.module';
import { SearchModule } from './search/search.module';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    EndpointsModule,
    ExecutorModule,
    HistoryModule,
    VariablesModule,
    BackupModule,
    ScenariosModule,
    ImportModule,
    SearchModule,
  ],
})
export class AppModule {}
