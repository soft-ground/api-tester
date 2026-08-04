import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { HistoryService, HistoryQuery } from './history.service';

// Whether it is a safe media type allowed to render inline. Only images/video/audio
// (which cannot execute scripts) are allowed; SVG (may contain scripts) is excluded.
function isInlineSafe(contentType: string): boolean {
  const base = (contentType || '').toLowerCase().split(';')[0].trim();
  if (base === 'image/svg+xml') return false;
  return (
    base.startsWith('image/') ||
    base.startsWith('video/') ||
    base.startsWith('audio/')
  );
}

@Controller('history')
export class HistoryController {
  constructor(private readonly service: HistoryService) {}

  @Get()
  list(@Query() query: HistoryQuery) {
    return this.service.list(query);
  }

  // ---- Folders (specific routes before :id) ----
  @Get('folders')
  listFolders() {
    return this.service.listFolders();
  }

  @Post('folders')
  createFolder(@Body() body: { name: string }) {
    return this.service.createFolder(body?.name);
  }

  @Patch('folders/:id')
  renameFolder(@Param('id') id: string, @Body() body: { name: string }) {
    return this.service.renameFolder(id, body?.name);
  }

  @Delete('folders/:id')
  deleteFolder(@Param('id') id: string) {
    return this.service.deleteFolder(id);
  }

  // ---- Move/delete history ----
  @Post('move')
  move(@Body() body: { ids: string[]; folderId: string | null }) {
    return this.service.move(body?.ids ?? [], body?.folderId ?? null);
  }

  @Post('delete')
  remove(@Body() body: { ids: string[] }) {
    return this.service.remove(body?.ids ?? []);
  }

  // Stream the raw response body (text/binary download/inline). Before :id.
  @Get(':id/body')
  async body(@Param('id') id: string, @Res() res: Response) {
    const b = await this.service.getBody(id);
    res.setHeader('Content-Type', b.contentType);
    // Block browser MIME sniffing (prevents reinterpreting the response as HTML/JS and running it same-origin)
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Only safe media (image/, video/, audio/, excluding svg) may render inline.
    // Force text/html, svg, octet-stream, etc. to attachment so that even opening the URL directly
    // saves instead of executing in the same origin.
    const disposition = isInlineSafe(b.contentType) ? 'inline' : 'attachment';
    const encoded = encodeURIComponent(b.filename);
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${b.filename.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encoded}`,
    );
    res.send(b.data);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }
}
