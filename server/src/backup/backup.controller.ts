import { Body, Controller, Get, Post } from '@nestjs/common';
import { BackupService } from './backup.service';

@Controller('backup')
export class BackupController {
  constructor(private readonly service: BackupService) {}

  @Get('export')
  export() {
    return this.service.export();
  }

  @Post('import')
  import(@Body() body: any) {
    return this.service.import(body);
  }
}
