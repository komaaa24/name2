import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import logger from '../../../shared/utils/logger';
import { RequestedNameEntity } from '../../../shared/database/entities';

export interface NameMeaning {
  meaning?: string;
  gender?: 'boy' | 'girl';
  error?: string;
}

interface NameMeaningApiPayload {
  description?: unknown;
  pol?: unknown;
}

@Injectable()
export class NameMeaningService {
  private readonly apiBaseUrl = 'http://94.158.53.20:8080/names_content.php';

  constructor(
    @InjectRepository(RequestedNameEntity)
    private readonly requestedNameRepository: Repository<RequestedNameEntity>,
  ) { }

  async getNameMeaning(name: string, telegramId?: number, username?: string): Promise<NameMeaning> {
    try {
      const response = await axios.get(this.apiBaseUrl, {
        params: {
          lang_id: 1,
          name: name.trim(),
        },
        timeout: 10000, // 10 second timeout
      });

      const parsedMeaning = this.parseApiResponse(response.data, name);

      if (!parsedMeaning.meaning) {
        await this.saveRequestedName(name, telegramId, username);
        return { error: "❌ Kechirasiz, bu ism haqida ma'lumot ma'lumotlar bazamizda yo'q.\n\n⏰ <b>Tez orada qo'shiladi!</b>\n\nSizning so'rovingiz admin paneliga yuborildi." };
      }

      return parsedMeaning;
    } catch (error) {
      logger.error('Name meaning API error:', error);
      return {
        error:
          "Ism manosi olishda xatolik yuz berdi. Iltimos, keyinroq urinib ko'ring.",
      };
    }
  }

  isValidName(name: string): boolean {
    // Check if name contains only letters, spaces, and apostrophes (for names like o'ktam, g'olib)
    const nameRegex = /^[a-zA-ZА-Яа-яЁёўўҳҳғғқққ\s']+$/u;
    return (
      nameRegex.test(name.trim()) &&
      name.trim().length > 0 &&
      name.trim().length <= 50
    );
  }

  formatNameMeaning(name: string, meaning: string): string {
    return `🌟 <b>${name}</b> ismining ma'nosi:\n\n${meaning}\n\nIsmlar manosi botidan foydalanishda davom eting.`;
  }

  private parseApiResponse(rawData: unknown, name: string): NameMeaning {
    const parsedObject = this.parseJsonString(rawData);

    if (parsedObject && typeof parsedObject === 'object') {
      return this.parseObjectPayload(parsedObject as NameMeaningApiPayload, name);
    }

    if (typeof rawData === 'string') {
      const meaning = this.normalizeMeaning(rawData, name);
      return meaning ? { meaning } : {};
    }

    return {};
  }

  private parseObjectPayload(payload: NameMeaningApiPayload, name: string): NameMeaning {
    const meaning = this.normalizeMeaning(payload.description, name);
    const gender = this.parseGender(payload.pol);

    if (!meaning) {
      return gender ? { gender } : {};
    }

    return gender ? { meaning, gender } : { meaning };
  }

  private parseJsonString(rawData: unknown): unknown {
    if (typeof rawData !== 'string') {
      return rawData;
    }

    const trimmed = rawData.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      return rawData;
    }

    try {
      return JSON.parse(trimmed);
    } catch (error) {
      logger.warn('Failed to parse names_content API JSON string:', error);
      return rawData;
    }
  }

  private normalizeMeaning(rawMeaning: unknown, name: string): string | undefined {
    if (typeof rawMeaning !== 'string') {
      return undefined;
    }

    const escapedName = this.escapeRegExp(name.trim());
    const cleanedMeaning = rawMeaning
      .trim()
      .replace(/^Ma'nosi:\s*/i, '')
      .replace(new RegExp(`^${escapedName}\\s*[-:–]\\s*`, 'i'), '')
      .replace(/\s*-\s*$/, '')
      .trim();

    if (!cleanedMeaning || cleanedMeaning === '-' || cleanedMeaning === '—') {
      return undefined;
    }

    return cleanedMeaning;
  }

  private parseGender(pol: unknown): 'boy' | 'girl' | undefined {
    if (pol === 1 || pol === '1') {
      return 'boy';
    }

    if (pol === 2 || pol === '2') {
      return 'girl';
    }

    return undefined;
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async saveRequestedName(name: string, telegramId?: number, username?: string): Promise<void> {
    try {
      const normalizedName = name.trim().toLowerCase();

      // Ism allaqachon mavjudmi tekshirish
      const existing = await this.requestedNameRepository.findOne({
        where: { normalizedName },
      });

      if (existing) {
        // Mavjud bo'lsa, faqat counterni oshirish
        existing.requestCount += 1;
        existing.lastRequestedBy = telegramId;
        existing.lastRequestedByUsername = username;
        await this.requestedNameRepository.save(existing);
      } else {
        // Yangi ism qo'shish
        const newRequest = this.requestedNameRepository.create({
          name: name.trim(),
          normalizedName,
          requestCount: 1,
          lastRequestedBy: telegramId,
          lastRequestedByUsername: username,
          isProcessed: false,
        });
        await this.requestedNameRepository.save(newRequest);
      }
    } catch (error) {
      logger.error('Save requested name error:', error);
      // Xato bo'lsa ham davom ettirish (foydalanuvchiga ta'sir qilmasligi uchun)
    }
  }
}
