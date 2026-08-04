import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(q: string) {
    const query = (q ?? '').trim();
    if (!query) {
      return { endpoints: [], scenarios: [], history: [] };
    }
    const like = { contains: query, mode: 'insensitive' as const };

    const [endpoints, scenarios, history] = await Promise.all([
      this.prisma.apiEndpoint.findMany({
        where: {
          OR: [{ name: like }, { path: like }, { baseUrl: like }],
        },
        take: 30,
        select: {
          id: true,
          name: true,
          method: true,
          path: true,
          collection: { select: { id: true, name: true } },
        },
      }),
      this.prisma.scenario.findMany({
        where: { OR: [{ name: like }, { desc: like }] },
        take: 20,
        select: { id: true, name: true },
      }),
      this.prisma.callHistory.findMany({
        where: { OR: [{ reqUrl: like }] },
        orderBy: { executedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          reqMethod: true,
          reqUrl: true,
          resStatus: true,
          executedAt: true,
        },
      }),
    ]);

    return { endpoints, scenarios, history };
  }
}
