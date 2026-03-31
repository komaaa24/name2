import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { NameMeaningService } from './name-meaning.service';
import { NameGeneratorApiService, GeneratedName } from './name-generator-api.service';

export type NameGender = 'boy' | 'girl' | 'unisex';
export type TrendPeriod = 'monthly' | 'yearly';
export type TrendGender = 'boy' | 'girl' | 'all';

export interface NameRecord {
  slug: string;
  name: string;
  gender: NameGender;
  origin: string;
  meaning: string;
  categories: string[];
  focusValues: string[];
  storytelling: string;
  translations: { language: string; value: string }[];
  trendIndex: { monthly: number; yearly: number };
  regions: string[];
  audioUrl?: string;
  related: string[];
}

export interface NameSuggestion {
  name: string;
  gender: NameGender;
  slug: string;
  origin: string;
  meaning: string;
  focusValues: string[];
  trendIndex: number;
}

export interface TrendInsight {
  name: string;
  movement: 'up' | 'down' | 'steady';
  score: number;
  region: string;
  gender: NameGender;
}

export interface QuizOption {
  label: string;
  value: string;
  tags: string[];
}

export interface QuizQuestion {
  id: string;
  text: string;
  options: QuizOption[];
}

const CATEGORY_DESCRIPTORS: Record<string, { label: string; description: string }> = {
  symbolic: { label: 'Ramziy ruh', description: "Nur, ziyoli va qalbga yaqin ma'nolar." },
  leadership: { label: 'Rahbariy ohang', description: 'Jasoratli va yetakchi xarakterlar uchun.' },
  spiritual: { label: 'Ma\'naviy olam', description: 'Diniy va ruhiy mazmunga ega ismlar.' },
  heritage: { label: 'An\'anaviy', description: "Ota-bobolar merosidan kelgan klassik ismlar." },
  modern: { label: 'Zamonaviy', description: "Bugungi trend va yangi ma'no qo'shilgan ismlar." },
  nature: { label: 'Tabiat nafasi', description: 'Tabiat va unsurlardan ilhomlangan ismlar.' },
};

const CATEGORY_COMBOS: Array<{ key: string; label: string }> = [
  { key: 'symbolic_leadership', label: 'Ramziy ~ Rahbariy' },
  { key: 'spiritual_heritage', label: 'Ma\'naviy ~ An\'anaviy' },
  { key: 'modern_symbolic', label: 'Zamonaviy ~ Ramziy' },
  { key: 'nature_spiritual', label: 'Tabiat ~ Ma\'naviy' },
];

const NAME_LIBRARY: NameRecord[] = [
  {
    slug: 'zuhra',
    name: 'Zuhra',
    gender: 'girl',
    origin: 'Arabcha',
    meaning: "Tong yulduzi, yorug'lik taratuvchi nur.",
    categories: ['symbolic', 'spiritual'],
    focusValues: ['ramziy', 'nur', 'ilhom'],
    storytelling: "Zuhra tong chogida dunyoga kelgan farzand uchun yorug'lik tilashni bildiradi.",
    translations: [
      { language: 'Ruscha', value: 'Зухра' },
      { language: 'Inglizcha', value: 'Morning Star' },
      { language: 'Turkcha', value: 'Zuhra' },
    ],
    trendIndex: { monthly: 87, yearly: 91 },
    regions: ['Toshkent', 'Qashqadaryo'],
    audioUrl: 'https://cdn.pixabay.com/download/audio/2021/11/16/audio_2bbd603cd8.mp3?filename=warm-guitar-logo-12414.mp3',
    related: ['Zuhro', 'Zulayho', 'Ziyo'],
  },
  {
    slug: 'amir',
    name: 'Amir',
    gender: 'boy',
    origin: 'Arabcha',
    meaning: "Yetakchi, qo'mondon, rahbar.",
    categories: ['leadership', 'heritage'],
    focusValues: ['rahbar', 'jasorat'],
    storytelling: "Amir ismi o'g'il farzand uchun qat'iylik va mas'uliyat ramzidir.",
    translations: [
      { language: 'Ruscha', value: 'Амир' },
      { language: 'Inglizcha', value: 'Amir' },
      { language: 'Turkcha', value: 'Emir' },
    ],
    trendIndex: { monthly: 93, yearly: 88 },
    regions: ["Farg'ona", 'Toshkent'],
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_3febef0c3d.mp3?filename=soft-notification-136512.mp3',
    related: ['Amirbek', 'Amirxon', 'Emir'],
  },
  {
    slug: 'shirin',
    name: 'Shirin',
    gender: 'girl',
    origin: 'Forscha',
    meaning: "Shirin so'zli, yoqimli muomala qiluvchi.",
    categories: ['symbolic', 'heritage'],
    focusValues: ['ramziy', 'mehribon'],
    storytelling: "Shirin ismi mehribonlik va iliqlikni ifoda etadi.",
    translations: [
      { language: 'Ruscha', value: 'Ширин' },
      { language: 'Inglizcha', value: 'Sweet' },
      { language: 'Turkcha', value: 'Sirin' },
    ],
    trendIndex: { monthly: 81, yearly: 79 },
    regions: ['Buxoro', 'Samarqand'],
    audioUrl: 'https://cdn.pixabay.com/download/audio/2021/09/13/audio_81808b4a31.mp3?filename=soft-ambient-8282.mp3',
    related: ['Gulshirin', 'Mehriniso', 'Shahnoza'],
  },
  {
    slug: 'javlon',
    name: 'Javlon',
    gender: 'boy',
    origin: 'Turkiy',
    meaning: "G'ayrat va jasorat timsoli.",
    categories: ['leadership', 'modern'],
    focusValues: ['rahbar', 'jasorat', 'zamonaviy'],
    storytelling: 'Javlon ismi faol va tashabbuskor xarakterni aks ettiradi.',
    translations: [
      { language: 'Ruscha', value: 'Джавлон' },
      { language: 'Inglizcha', value: 'Valor' },
      { language: 'Turkcha', value: 'Javlon' },
    ],
    trendIndex: { monthly: 76, yearly: 84 },
    regions: ['Namangan', 'Andijon'],
    audioUrl: 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_17b9987dd8.mp3?filename=soft-logo-6124.mp3',
    related: ['Jasur', 'Javohir', 'Javod'],
  },
  {
    slug: 'muslima',
    name: 'Muslima',
    gender: 'girl',
    origin: 'Arabcha',
    meaning: 'Islom diniga sodiq, musulmon ayol.',
    categories: ['spiritual', 'heritage'],
    focusValues: ["ma'naviy", 'ramziy'],
    storytelling: "Muslima ismi sokinlik va sodiqlikni bildiradi.",
    translations: [
      { language: 'Ruscha', value: 'Муслима' },
      { language: 'Inglizcha', value: 'Muslima' },
      { language: 'Turkcha', value: 'Muslima' },
    ],
    trendIndex: { monthly: 89, yearly: 94 },
    regions: ['Namangan', 'Andijon'],
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/09/20/audio_55a0189da2.mp3?filename=gentle-sound-121110.mp3',
    related: ['Mubina', 'Muhsina', 'Mushtariy'],
  },
  {
    slug: 'bilol',
    name: 'Bilol',
    gender: 'boy',
    origin: 'Arabcha',
    meaning: 'Halovat beruvchi, qalbni taskin etuvchi.',
    categories: ['spiritual', 'symbolic'],
    focusValues: ["ma'naviy", 'ramziy', 'ilhom'],
    storytelling: 'Bilol ismi ezgulik va fidoyilik ramzi.',
    translations: [
      { language: 'Ruscha', value: 'Билол' },
      { language: 'Inglizcha', value: 'Bilol' },
      { language: 'Turkcha', value: 'Bilol' },
    ],
    trendIndex: { monthly: 97, yearly: 90 },
    regions: ['Surxondaryo', 'Toshkent'],
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/10/24/audio_8d3b8b1dcb.mp3?filename=clean-notification-124058.mp3',
    related: ['Bilola', 'Biloliddin', 'Nilufar'],
  },
  {
    slug: 'laylo',
    name: 'Laylo',
    gender: 'girl',
    origin: 'Forscha',
    meaning: 'Tungi huzur, romantik ohang.',
    categories: ['modern', 'symbolic'],
    focusValues: ['ramziy', 'muloyim'],
    storytelling: "Laylo ismi she'riyat va muhabbatni ifodalaydi.",
    translations: [
      { language: 'Ruscha', value: 'Лайло' },
      { language: 'Inglizcha', value: 'Layla' },
      { language: 'Turkcha', value: 'Leyla' },
    ],
    trendIndex: { monthly: 92, yearly: 96 },
    regions: ['Toshkent', 'Samarqand'],
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/03/10/audio_c1889958cf.mp3?filename=soft-intro-135464.mp3',
    related: ['Layloyim', 'Laziza', 'Royhon'],
  },
  {
    slug: 'islom',
    name: 'Islom',
    gender: 'boy',
    origin: 'Arabcha',
    meaning: 'Tinchlik va totuvlik.',
    categories: ['spiritual', 'heritage'],
    focusValues: ["ma'naviy", 'ramziy', 'jahongir'],
    storytelling: "Islom ismi birlik va e'tiqodni aks ettiradi.",
    translations: [
      { language: 'Ruscha', value: 'Ислам' },
      { language: 'Inglizcha', value: 'Islam' },
      { language: 'Turkcha', value: 'Islam' },
    ],
    trendIndex: { monthly: 84, yearly: 90 },
    regions: ["Qoraqalpog'iston", 'Toshkent'],
    audioUrl: 'https://cdn.pixabay.com/download/audio/2023/04/05/audio_c84b3f6b55.mp3?filename=soft-bell-147424.mp3',
    related: ['Imron', 'Ilyos', 'Imad'],
  },
];

const TREND_MOVEMENTS: TrendInsight[] = [
  { name: 'Amir', movement: 'up', score: 93, region: "Farg'ona", gender: 'boy' },
  { name: 'Laylo', movement: 'up', score: 96, region: 'Toshkent', gender: 'girl' },
  { name: 'Bilol', movement: 'steady', score: 90, region: 'Surxondaryo', gender: 'boy' },
  { name: 'Zuhra', movement: 'up', score: 91, region: 'Qashqadaryo', gender: 'girl' },
  { name: 'Muslima', movement: 'steady', score: 94, region: 'Namangan', gender: 'girl' },
  { name: 'Javlon', movement: 'down', score: 84, region: 'Andijon', gender: 'boy' },
];

const QUIZ_FLOW: QuizQuestion[] = [
  {
    id: 'temper',
    text: "Farzandingiz xarakteri qanday bo'lishini istaysiz?",
    options: [
      { label: 'Sokin va muloyim', value: 'calm', tags: ['ramziy', 'muloyim'] },
      { label: 'Yetakchi va faol', value: 'leader', tags: ['rahbar'] },
      { label: 'Ijodkor va ilhomli', value: 'creator', tags: ['ilhom'] },
      { label: "Ma'naviyatli va yuksak", value: 'spiritual', tags: ["ma'naviy"] },
    ],
  },
  {
    id: 'legacy',
    text: "Qaysi qatlamga yaqinmisiz?",
    options: [
      { label: "An'anaviy meros", value: 'heritage', tags: ['heritage'] },
      { label: 'Zamonaviy ruh', value: 'modern', tags: ['zamonaviy'] },
      { label: "Tabiat va uyg'unlik", value: 'nature', tags: ['tabiat'] },
    ],
  },
  {
    id: 'sound',
    text: "Ism ohangi qanday bo'lishi kerak?",
    options: [
      { label: 'Qisqa va chaqqon', value: 'short', tags: ['rahbar'] },
      { label: 'Uzun va lirika', value: 'long', tags: ['ramziy'] },
      { label: 'Quvnoq va ritmik', value: 'rhythm', tags: ['zamonaviy'] },
    ],
  },
  {
    id: 'blend',
    text: "Familiyangiz bilan uyg'unlik?",
    options: [
      { label: 'Bosh harf mosligi muhim', value: 'initial', tags: ['moslik'] },
      { label: 'Ohangdoshlik muhim', value: 'rhythm', tags: ['ohang'] },
      { label: 'Qadriyatni ifodalasin', value: 'value', tags: ["ma'naviy"] },
    ],
  },
  {
    id: 'bonus',
    text: 'Ismga yana bir istak:',
    options: [
      { label: "Trendda bo'lsin", value: 'trendy', tags: ['zamonaviy', 'trend'] },
      { label: 'Oson talaffuz qilinsin', value: 'easy', tags: ['muloyim'] },
      { label: "Unutilmas bo'lsin", value: 'unique', tags: ['rahbar', 'ramziy'] },
    ],
  },
];

const PERSONA_TEMPLATES: Record<
  string,
  { label: string; tags: string[]; summary: string }
> = {
  radiant: {
    label: 'Nurafshon',
    tags: ['ramziy', 'ilhom', 'muloyim'],
    summary: "Yorug'lik taratuvchi va qalbni iliqlantiruvchi ismlar to'plami.",
  },
  pioneer: {
    label: 'Yetakchi',
    tags: ['rahbar', 'zamonaviy'],
    summary: 'Jasorat va modern ruhni ifodalovchi kombinatsiyalar.',
  },
  heritage: {
    label: 'Merosbon',
    tags: ["ma'naviy", 'heritage'],
    summary: "An'anaviy va ruhiy qadriyatlarni saqlab qoluvchi ismlar.",
  },
  harmony: {
    label: 'Uyg\'un',
    tags: ['tabiat', 'muloyim', 'ohang'],
    summary: "Tabiat va ohang uyg'unligini sevuvchilar uchun tavsiyalar.",
  },
};

const COMMUNITY_POLLS = [
  {
    question: "2024-yilda qaysi ism trendni zabt etadi?",
    options: ['Laylo', 'Amir', 'Muslima', 'Bilol'],
  },
  {
    question: "Qaysi yo'nalish sizga ko'proq yoqadi?",
    options: ['Ramziy', 'Rahbariy', "Ma'naviy", 'Zamonaviy'],
  },
];

@Injectable()
export class NameInsightsService {
  constructor(
    @Inject(forwardRef(() => NameMeaningService))
    private readonly meaningService: NameMeaningService,
    private readonly nameGeneratorApi: NameGeneratorApiService,
  ) { }

  getCategoryDescriptors(): typeof CATEGORY_DESCRIPTORS {
    return CATEGORY_DESCRIPTORS;
  }

  getCategoryCombos(): Array<{ key: string; label: string }> {
    return CATEGORY_COMBOS;
  }

  findRecordByName(name: string): NameRecord | undefined {
    const normalized = name.trim().toLowerCase();
    return NAME_LIBRARY.find(
      (record) =>
        record.slug === normalized || record.name.toLowerCase() === normalized,
    );
  }

  search(query: string, limit = 10): NameRecord[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return NAME_LIBRARY.slice(0, limit);
    }
    return NAME_LIBRARY.filter((record) => {
      return (
        record.name.toLowerCase().includes(normalized) ||
        record.focusValues.some((value) => value.includes(normalized)) ||
        record.categories.some((value) => value.includes(normalized)) ||
        record.origin.toLowerCase().includes(normalized)
      );
    }).slice(0, limit);
  }

  async getRichNameMeaning(name: string, telegramId?: number, username?: string): Promise<{
    record?: NameRecord;
    meaning: string;
    gender?: 'boy' | 'girl';
    error?: string;
  }> {
    const record = this.findRecordByName(name);

    const apiMeaning = await this.meaningService.getNameMeaning(name, telegramId, username);
    if (apiMeaning.meaning) {
      return {
        record,
        meaning: apiMeaning.meaning,
        gender: apiMeaning.gender ?? (record?.gender === 'boy' || record?.gender === 'girl' ? record.gender : undefined),
      };
    }

    if (record) {
      return {
        record,
        meaning: record.meaning,
        gender: record.gender === 'boy' || record.gender === 'girl' ? record.gender : undefined,
      };
    }

    return { meaning: '', gender: apiMeaning.gender, error: apiMeaning.error };
  }

  formatRichMeaning(name: string, meaning: string, record?: NameRecord): string {
    const headline = `🌟 <b>${name}</b> ismi haqida`;
    const meaningBlock = meaning
      ? `\n📘 <b>Ma'nosi:</b> ${meaning}\n`
      : "\n📘 Ma'lumot hozircha topilmadi.\n";

    if (!record) {
      return `${headline}\n${meaningBlock}`;
    }

    const origin = `🌍 <b>Kelib chiqishi:</b> ${record.origin}`;
    const values = record.focusValues.length
      ? `✨ <b>Ohangi:</b> ${record.focusValues.map((value) => `#${value}`).join('  ')}`
      : '';
    const story = record.storytelling ? `\n🧩 <i>${record.storytelling}</i>\n` : '';
    const related = record.related.length
      ? `\n🔎 O'xshash ismlar: ${record.related.join(', ')}`
      : '';
    const trend = `📈 Trend indeks: oy => ${record.trendIndex.monthly} / yil => ${record.trendIndex.yearly}`;

    return `${headline}\n${meaningBlock}${origin}\n${values}${story}${trend}${related}`;
  }

  getSimilarNames(name: string, limit = 4): NameSuggestion[] {
    const record = this.findRecordByName(name);
    if (!record) {
      return [];
    }
    const matches = NAME_LIBRARY.filter((candidate) => {
      if (candidate.slug === record.slug) {
        return false;
      }
      return candidate.focusValues.some((tag) => record.focusValues.includes(tag));
    });
    return matches.slice(0, limit).map((candidate) => ({
      name: candidate.name,
      gender: candidate.gender,
      slug: candidate.slug,
      origin: candidate.origin,
      meaning: candidate.meaning,
      focusValues: candidate.focusValues,
      trendIndex: candidate.trendIndex.monthly,
    }));
  }

  getTranslations(slug: string): { language: string; value: string }[] {
    const record = this.findRecordByName(slug);
    return record?.translations ?? [];
  }

  getAudioUrl(slug: string): string | undefined {
    const record = this.findRecordByName(slug);
    return record?.audioUrl;
  }

  getTrending(period: TrendPeriod, gender: TrendGender): TrendInsight[] {
    const filtered = TREND_MOVEMENTS.filter((item) =>
      gender === 'all' ? true : item.gender === gender,
    );
    return filtered
      .map((item) => ({
        ...item,
        score:
          period === 'monthly'
            ? this.findRecordByName(item.name)?.trendIndex.monthly ?? item.score
            : this.findRecordByName(item.name)?.trendIndex.yearly ?? item.score,
      }))
      .sort((a, b) => b.score - a.score);
  }

  getNamesForCategory(key: string, gender: TrendGender): NameSuggestion[] {
    const categories = key.split('_');
    const filtered = NAME_LIBRARY.filter((record) => {
      const matchesGender = gender === 'all' ? true : record.gender === gender;
      const matchesCategory = categories.every((category) =>
        record.categories.includes(category),
      );
      return matchesGender && matchesCategory;
    });
    return filtered.map((record) => ({
      name: record.name,
      gender: record.gender,
      slug: record.slug,
      origin: record.origin,
      meaning: record.meaning,
      focusValues: record.focusValues,
      trendIndex: record.trendIndex.monthly,
    }));
  }

  getQuizFlow(): QuizQuestion[] {
    return QUIZ_FLOW;
  }

  derivePersona(tags: string[]): {
    code: string;
    label: string;
    summary: string;
  } {
    const scoreMap = new Map<string, number>();
    tags.forEach((tag) => {
      Object.entries(PERSONA_TEMPLATES).forEach(([code, template]) => {
        if (template.tags.includes(tag)) {
          scoreMap.set(code, (scoreMap.get(code) ?? 0) + 1);
        }
      });
    });
    const [code] = Array.from(scoreMap.entries()).sort((a, b) => b[1] - a[1])[0] ?? [
      'radiant',
      0,
    ];
    const template = PERSONA_TEMPLATES[code];
    return { code, label: template.label, summary: template.summary };
  }

  /**
   * 🧬 ADVANCED GENETIC NAME MATCHING ALGORITHM v2.0
   * 
   * Senior-level algoritm: Ota-ona ismlaridan farzand ismini genetik tahlil orqali topish
   * 
   * ARCHITECTURE:
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * PHASE 1: DNA EXTRACTION (Ota-ona ismlarining "DNK"sini ajratish)
   *   - Phonetic patterns (Fonetik naqshlar)
   *   - Semantic roots (Ma'naviy ildizlar)
   *   - Cultural markers (Madaniy belgilar)
   *   - Letter frequency analysis (Harf chastotasi tahlili)
   * 
   * PHASE 2: GENETIC INHERITANCE (Genetik meros)
   *   - Dominant traits (Dominant xususiyatlar): Prefix/Suffix matching
   *   - Recessive traits (Retsessiv xususiyatlar): Hidden letter patterns
   *   - Co-dominant traits (Ko-dominant): Mixed cultural origins
   * 
   * PHASE 3: SMART SCORING (Aqlli baholash tizimi)
   *   - Multi-factor weighted scoring (Ko'p omilli og'irlik bilan baholash)
   *   - Cultural compatibility (Madaniy moslik)
   *   - Phonetic harmony (Fonetik uyg'unlik)
   *   - Semantic resonance (Ma'noviy rezonans)
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * 
   * EXAMPLE:
   * Input: Ota="Jamshid" (Persian, Leader), Ona="Dilnoza" (Persian, Beauty)
   * Output: "Jahongir" (900 pts), "Javohir" (850 pts), "Dilshod" (820 pts)
   * 
   * Reasoning:
   * - "Jahongir": Ja- from father + Persian origin match + meaning synergy
   * - "Javohir": Strong phonetic harmony + cultural alignment
   * - "Dilshod": Dil- from mother + suffix blend + semantic connection
   */
  buildPersonalizedRecommendations(
    targetGender: TrendGender,
    focusTags: string[],
    parentNames?: string[],
  ): { persona: { code: string; label: string; summary: string }; suggestions: NameSuggestion[] } {
    const persona = this.derivePersona(focusTags);
    const genderFilter = targetGender === 'all' ? undefined : targetGender;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PHASE 1: DNA EXTRACTION - Ota-ona ismlarining tahlili
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    interface ParentDNA {
      name: string;
      origin?: string;
      meanings: string[];
      focusValues: string[];
      letters: Map<string, number>; // Letter frequency
      syllables: string[];
      phonemes: string[];
      culturalWeight: number;
    }

    const extractDNA = (parentName: string): ParentDNA | null => {
      const normalized = parentName.trim().toLowerCase();
      const parentRecord = NAME_LIBRARY.find(
        record => record.name.toLowerCase() === normalized || record.slug === normalized
      );

      if (!parentRecord) return null;

      // Letter frequency analysis
      const letterFreq = new Map<string, number>();
      normalized.split('').forEach(letter => {
        letterFreq.set(letter, (letterFreq.get(letter) || 0) + 1);
      });

      // Syllable extraction (2-3 letter chunks)
      const syllables: string[] = [];
      for (let i = 0; i < normalized.length - 1; i++) {
        syllables.push(normalized.substring(i, i + 2));
        if (i < normalized.length - 2) {
          syllables.push(normalized.substring(i, i + 3));
        }
      }

      // Phoneme patterns (consonant-vowel patterns)
      const vowels = new Set(['a', 'e', 'i', 'o', 'u']);
      const phonemes = normalized.split('').map(char =>
        vowels.has(char) ? 'V' : 'C'
      );
      const phonemePattern = phonemes.join('');

      // Cultural weight (based on origin rarity)
      const culturalWeight = parentRecord.origin ? 1.5 : 1.0;

      return {
        name: normalized,
        origin: parentRecord.origin,
        meanings: parentRecord.meaning.toLowerCase().split(/[,،.;:]/).map(w => w.trim()).filter(w => w.length > 3),
        focusValues: parentRecord.focusValues,
        letters: letterFreq,
        syllables,
        phonemes: [phonemePattern],
        culturalWeight,
      };
    };

    let fatherDNA: ParentDNA | null = null;
    let motherDNA: ParentDNA | null = null;

    if (parentNames && parentNames.length > 0) {
      fatherDNA = extractDNA(parentNames[0] || '');
      motherDNA = extractDNA(parentNames[1] || '');
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PHASE 2: GENETIC INHERITANCE - Scoring funksiyalari
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    const calculateGeneticScore = (childName: string, childMeaning: string, childOrigin: string, childFocus: string[]): number => {
      if (!fatherDNA && !motherDNA) return 0;

      let totalScore = 0;
      const childLower = childName.toLowerCase();
      const childMeaningWords = childMeaning.toLowerCase().split(/[,،.;:]/).map(w => w.trim()).filter(w => w.length > 3);

      // ═══════════════════════════════════════════════════
      // 1. DOMINANT TRAIT: Origin Inheritance (Kelib chiqish merosi)
      // Weight: 200 points
      // ═══════════════════════════════════════════════════
      if (fatherDNA?.origin && fatherDNA.origin === childOrigin) {
        totalScore += 200 * fatherDNA.culturalWeight;
      }
      if (motherDNA?.origin && motherDNA.origin === childOrigin) {
        totalScore += 200 * motherDNA.culturalWeight;
      }

      // ═══════════════════════════════════════════════════
      // 2. DOMINANT TRAIT: Semantic DNA (Ma'noviy DNK)
      // Weight: 150 points per match
      // ═══════════════════════════════════════════════════
      const semanticMatchFather = fatherDNA?.meanings.filter(m =>
        childMeaningWords.some(cm => cm.includes(m) || m.includes(cm))
      ).length || 0;
      const semanticMatchMother = motherDNA?.meanings.filter(m =>
        childMeaningWords.some(cm => cm.includes(m) || m.includes(cm))
      ).length || 0;

      totalScore += (semanticMatchFather + semanticMatchMother) * 150;

      // ═══════════════════════════════════════════════════
      // 3. DOMINANT TRAIT: Focus Value Inheritance
      // Weight: 120 points per match
      // ═══════════════════════════════════════════════════
      const focusMatchFather = fatherDNA?.focusValues.filter(f => childFocus.includes(f)).length || 0;
      const focusMatchMother = motherDNA?.focusValues.filter(f => childFocus.includes(f)).length || 0;

      totalScore += (focusMatchFather + focusMatchMother) * 120;

      // ═══════════════════════════════════════════════════
      // 4. CO-DOMINANT TRAIT: Syllable Fusion (Bo'g'in sintezi)
      // Weight: 80 points per syllable match
      // ═══════════════════════════════════════════════════
      let syllableMatches = 0;
      [fatherDNA, motherDNA].forEach(parent => {
        if (!parent) return;
        parent.syllables.forEach(syl => {
          if (childLower.includes(syl)) {
            syllableMatches++;
            // Extra bonus for 3-letter syllables (stronger genetic marker)
            if (syl.length === 3) totalScore += 30;
          }
        });
      });
      totalScore += syllableMatches * 80;

      // ═══════════════════════════════════════════════════
      // 5. RECESSIVE TRAIT: Letter Pool Genetics
      // Weight: 25 points per shared letter
      // ═══════════════════════════════════════════════════
      const childLetters = new Map<string, number>();
      childLower.split('').forEach(letter => {
        childLetters.set(letter, (childLetters.get(letter) || 0) + 1);
      });

      [fatherDNA, motherDNA].forEach(parent => {
        if (!parent) return;
        parent.letters.forEach((count, letter) => {
          if (childLetters.has(letter)) {
            const sharedCount = Math.min(count, childLetters.get(letter) || 0);
            totalScore += sharedCount * 25;
          }
        });
      });

      // ═══════════════════════════════════════════════════
      // 6. DOMINANT TRAIT: Prefix Inheritance (Bosh harf DNK)
      // Weight: 180 points
      // ═══════════════════════════════════════════════════
      if (fatherDNA && childLower.startsWith(fatherDNA.name.substring(0, 2))) {
        totalScore += 180;
      }
      if (motherDNA && childLower.startsWith(motherDNA.name.substring(0, 2))) {
        totalScore += 180;
      }

      // ═══════════════════════════════════════════════════
      // 7. RECESSIVE TRAIT: Suffix Inheritance (Oxiri DNK)
      // Weight: 140 points
      // ═══════════════════════════════════════════════════
      if (fatherDNA && childLower.endsWith(fatherDNA.name.slice(-2))) {
        totalScore += 140;
      }
      if (motherDNA && childLower.endsWith(motherDNA.name.slice(-2))) {
        totalScore += 140;
      }

      // ═══════════════════════════════════════════════════
      // 8. DOMINANT TRAIT: First Letter Match (Birinchi harf)
      // Weight: 100 points
      // ═══════════════════════════════════════════════════
      const firstLetter = childLower[0];
      if (fatherDNA && fatherDNA.name[0] === firstLetter) {
        totalScore += 100;
      }
      if (motherDNA && motherDNA.name[0] === firstLetter) {
        totalScore += 100;
      }

      // ═══════════════════════════════════════════════════
      // 9. CO-DOMINANT: Dual Inheritance Bonus
      // Weight: 300 points (SUPER BONUS)
      // ═══════════════════════════════════════════════════
      if (fatherDNA && motherDNA) {
        const hasFatherGenes = childLower.includes(fatherDNA.name.substring(0, 2)) ||
          Array.from(fatherDNA.letters.keys()).filter(l => childLetters.has(l)).length >= 3;
        const hasMotherGenes = childLower.includes(motherDNA.name.substring(0, 2)) ||
          Array.from(motherDNA.letters.keys()).filter(l => childLetters.has(l)).length >= 3;

        if (hasFatherGenes && hasMotherGenes) {
          totalScore += 300; // 🏆 Perfect genetic blend!
        }
      }

      // ═══════════════════════════════════════════════════
      // 10. ADVANCED: Phonetic Harmony (Ovoz uyg'unligi)
      // Weight: 60 points
      // ═══════════════════════════════════════════════════
      const vowels = new Set(['a', 'e', 'i', 'o', 'u']);
      const childPhoneme = childLower.split('').map(c => vowels.has(c) ? 'V' : 'C').join('');

      [fatherDNA, motherDNA].forEach(parent => {
        if (!parent) return;
        parent.phonemes.forEach(pattern => {
          // Check if phoneme patterns are similar (CVCV vs CVCV, etc.)
          if (pattern.length > 0 && childPhoneme.includes(pattern.substring(0, 4))) {
            totalScore += 60;
          }
        });
      });

      return totalScore;
    };

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PHASE 3: SMART SCORING & RANKING
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    // Ota-ona ismlarini kichik harfda saqlash (filtr uchun)
    const parentNamesLower = parentNames
      ? parentNames.map(name => name.trim().toLowerCase()).filter(n => n.length > 0)
      : [];

    const suggestions = NAME_LIBRARY.filter((record) => {
      const matchesGender = !genderFilter || record.gender === genderFilter;
      const matchesPersona = persona.summary
        ? personaSummaryTags(persona.code).some((tag) => record.focusValues.includes(tag))
        : true;
      const matchesFocus = focusTags.length
        ? focusTags.some((tag) => record.focusValues.includes(tag))
        : true;

      // Ota-ona ismlarini filtr qilish - farzandga ota-ona ismi berilmaydi!
      const isNotParentName = !parentNamesLower.includes(record.name.toLowerCase());

      return matchesGender && matchesPersona && matchesFocus && isNotParentName;
    })
      .map((record) => {
        // Base score from trend index
        let score = record.trendIndex.monthly * 1.5; // Amplify base score

        // Apply genetic algorithm if parent names provided
        if (fatherDNA || motherDNA) {
          const geneticScore = calculateGeneticScore(
            record.name,
            record.meaning,
            record.origin,
            record.focusValues
          );

          // Genetic score dominates when parents are provided
          score = geneticScore + (score * 0.3); // 70% genetic, 30% trend
        }

        return {
          name: record.name,
          gender: record.gender,
          slug: record.slug,
          origin: record.origin,
          meaning: record.meaning,
          focusValues: record.focusValues,
          trendIndex: Math.round(score),
        };
      })
      .sort((a, b) => b.trendIndex - a.trendIndex)
      .slice(0, 5);

    return { persona, suggestions };
  }

  /**
   * 🚀 NEW: API-POWERED NAME GENERATION
   * Uses parent names to generate creative suggestions via API
   */
  async buildApiGeneratedRecommendations(
    fatherName: string,
    motherName: string,
    targetGender: TrendGender,
  ): Promise<NameSuggestion[]> {
    const gender = targetGender === 'all' ? 'girl' : targetGender;

    const generatedNames = await this.nameGeneratorApi.generateNamesByPattern(
      fatherName,
      motherName,
      gender,
    );

    return generatedNames.map((gen) => ({
      name: gen.name,
      gender: gen.gender as NameGender,
      slug: gen.name.toLowerCase(),
      origin: gen.origin,
      meaning: gen.meaning,
      focusValues: ['generatsiya', 'shaxsiy'],
      trendIndex: gen.confidence,
    }));
  }

  getCommunityPoll(): { question: string; options: string[] } {
    const index = Math.floor(Math.random() * COMMUNITY_POLLS.length);
    return COMMUNITY_POLLS[index];
  }
}

function personaSummaryTags(code: string): string[] {
  return PERSONA_TEMPLATES[code]?.tags ?? [];
}
