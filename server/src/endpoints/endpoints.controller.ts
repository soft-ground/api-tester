import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { EndpointsService } from './endpoints.service';
import {
  CreateCollectionDto,
  CreateEndpointDto,
  MoveCollectionDto,
  UpdateCollectionDto,
  UpdateEndpointDto,
} from './dto';

@Controller()
export class EndpointsController {
  constructor(private readonly service: EndpointsService) {}

  // ---- Collections ----

  @Get('collections')
  listCollections() {
    return this.service.listCollections();
  }

  @Post('collections')
  createCollection(@Body() dto: CreateCollectionDto) {
    return this.service.createCollection(dto);
  }

  @Post('collections/reorder')
  reorderCollections(@Body() body: { ids: string[] }) {
    return this.service.reorderCollections(body.ids ?? []);
  }

  // Move a group (change parent). Before :id.
  @Post('collections/:id/move')
  moveCollection(@Param('id') id: string, @Body() dto: MoveCollectionDto) {
    return this.service.moveCollection(id, dto);
  }

  @Patch('collections/:id')
  updateCollection(@Param('id') id: string, @Body() dto: UpdateCollectionDto) {
    return this.service.updateCollection(id, dto);
  }

  @Delete('collections/:id')
  deleteCollection(@Param('id') id: string) {
    return this.service.deleteCollection(id);
  }

  // ---- Endpoints ----

  @Get('endpoints/:id')
  getEndpoint(@Param('id') id: string) {
    return this.service.getEndpoint(id);
  }

  @Post('endpoints')
  createEndpoint(@Body() dto: CreateEndpointDto) {
    return this.service.createEndpoint(dto);
  }

  @Post('endpoints/reorder')
  reorderEndpoints(@Body() body: { ids: string[] }) {
    return this.service.reorderEndpoints(body.ids ?? []);
  }

  @Post('endpoints/:id/duplicate')
  duplicateEndpoint(@Param('id') id: string) {
    return this.service.duplicateEndpoint(id);
  }

  @Patch('endpoints/:id')
  updateEndpoint(@Param('id') id: string, @Body() dto: UpdateEndpointDto) {
    return this.service.updateEndpoint(id, dto);
  }

  @Delete('endpoints/:id')
  deleteEndpoint(@Param('id') id: string) {
    return this.service.deleteEndpoint(id);
  }
}
