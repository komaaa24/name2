import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface NameMatchResult {
  yourName: string;
  matchName: string;
  percent: string;
  type: string;
  text: string;
}

export interface NameMatchBatch {
  primary: NameMatchResult;
  alternatives: NameMatchResult[];
}

interface NameMatchApiResponse {
  your_name?: string;
  match_name?: string;
  percent?: string;
  type?: string;
  text?: string;
}

@Injectable()
export class NameMatchService {
  private readonly logger = new Logger(NameMatchService.name);
  private readonly apiUrl = 'http://94.158.53.20:8080/names_mos.php';

  constructor(private readonly httpService: HttpService) {}

  async getMatch(name: string): Promise<NameMatchResult> {
    const cleanedName = name.trim();

    try {
      const response = await firstValueFrom(
        this.httpService.get<NameMatchApiResponse>(this.apiUrl, {
          params: { name: cleanedName },
          timeout: 10000,
        }),
      );

      const payload = response.data;
      const matchName = this.toDisplayName(payload?.match_name);
      if (!matchName) {
        throw new Error('Invalid match API response');
      }

      return {
        yourName: this.toDisplayName(payload?.your_name) || this.toDisplayName(cleanedName),
        matchName,
        percent: this.normalizePercent(payload?.percent),
        type: payload?.type?.trim() || '💖 Sizga mos juftlik',
        text: payload?.text?.trim() || '',
      };
    } catch (error) {
      this.logger.error(`Name match API failed for ${cleanedName}`, error as any);
      throw new Error("Mos ismni topishda xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko'ring.");
    }
  }

  async getMatchBatch(name: string, desiredCount = 4): Promise<NameMatchBatch> {
    const cleanedName = name.trim();
    const uniqueMatches = new Map<string, NameMatchResult>();
    const attempts = Math.max(desiredCount * 3, 6);

    for (let i = 0; i < attempts; i += 1) {
      try {
        const result = await this.getMatch(cleanedName);
        const key = result.matchName.toLowerCase();

        if (!uniqueMatches.has(key)) {
          uniqueMatches.set(key, result);
        }

        if (uniqueMatches.size >= desiredCount) {
          break;
        }
      } catch (error) {
        this.logger.warn(`Name match batch attempt ${i + 1} failed for ${cleanedName}`);
      }
    }

    const matches = Array.from(uniqueMatches.values());
    if (!matches.length) {
      throw new Error("Mos ismni topishda xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko'ring.");
    }

    return {
      primary: matches[0],
      alternatives: matches.slice(1),
    };
  }

  private normalizePercent(value?: string): string {
    const trimmed = value?.trim();
    if (!trimmed) {
      return 'Topilmadi';
    }

    return trimmed.includes('%') ? trimmed : `${trimmed}%`;
  }

  private toDisplayName(value?: string): string {
    if (!value) {
      return '';
    }

    return value
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
}
