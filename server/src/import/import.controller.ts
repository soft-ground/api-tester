import { Body, Controller, Post } from '@nestjs/common';
import { ImportService } from './import.service';

@Controller('import')
export class ImportController {
  constructor(private readonly service: ImportService) {}

  @Post('openapi')
  openapi(
    @Body() body: { spec?: any; url?: string; collectionName?: string },
  ) {
    return this.service.importOpenapi(body);
  }

  @Post('curl')
  curl(@Body() body: { curl: string; collectionName?: string }) {
    return this.service.importCurl(body);
  }
}
