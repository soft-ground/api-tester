import { Body, Controller, Post } from '@nestjs/common';
import { ExecutorService } from './executor.service';
import { ExecuteDto } from './dto';

@Controller('execute')
export class ExecutorController {
  constructor(private readonly service: ExecutorService) {}

  @Post()
  execute(@Body() dto: ExecuteDto) {
    return this.service.execute(dto);
  }
}
