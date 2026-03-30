import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

type CanvasContext = any;
type CanvasImage = {
  width: number;
  height: number;
};

interface CanvasRuntime {
  createCanvas: (width: number, height: number) => {
    getContext: (type: '2d') => CanvasContext;
    toBuffer: (mimeType?: string) => Buffer;
  };
  registerFont: (fontPath: string, options: { family: string; weight?: string }) => void;
  loadImage: (src: string | Buffer) => Promise<CanvasImage>;
}

interface CardSize {
  width: number;
  height: number;
  radius: number;
}

interface WrappedTextLayout {
  lines: string[];
  fontSize: number;
  lineHeight: number;
}

@Injectable()
export class NameCardGeneratorService {
  private readonly logger = new Logger(NameCardGeneratorService.name);
  private readonly canvasRuntime: CanvasRuntime;
  private readonly defaultCard: CardSize = { width: 700, height: 700, radius: 25 };
  private readonly boyCard: CardSize = { width: 900, height: 1600, radius: 36 };
  private readonly girlCard: CardSize = { width: 900, height: 1600, radius: 36 };
  private readonly boyTemplatePath = path.join(process.cwd(), 'assets', 'card-templates', 'boy-mountain-clean.png');
  private readonly girlTemplatePath = path.join(process.cwd(), 'assets', 'card-templates', 'girl-floral-frame-clean.png');

  constructor() {
    this.canvasRuntime = this.resolveCanvasRuntime();
    this.registerFonts();
  }

  private resolveCanvasRuntime(): CanvasRuntime {
    const canvasModule = require('canvas');
    if (this.isRealCanvasRuntime(canvasModule)) {
      return canvasModule;
    }

    const packageDir = path.dirname(require.resolve('canvas/package.json'));

    try {
      const Canvas = require(path.join(packageDir, 'lib', 'canvas'));
      const Image = require(path.join(packageDir, 'lib', 'image'));
      const runtime: CanvasRuntime = {
        createCanvas: (width: number, height: number) => new Canvas(width, height),
        registerFont: Canvas._registerFont.bind(Canvas),
        loadImage: (src: string | Buffer) =>
          new Promise((resolve, reject) => {
            const image = new Image();
            let settled = false;
            const finish = (value: CanvasImage | Error, isError: boolean): void => {
              if (settled) {
                return;
              }
              settled = true;
              if (isError) {
                reject(value);
                return;
              }
              resolve(value as CanvasImage);
            };

            image.onload = () => finish(image, false);
            image.onerror = (error: Error) => finish(error, true);
            image.src = src;

            if (image.width > 0 && image.height > 0) {
              finish(image, false);
            }
          }),
      };

      if (this.isRealCanvasRuntime(runtime)) {
        this.logger.warn('Stub canvas module detected, switched to native canvas bindings.');
        return runtime;
      }
    } catch (error) {
      this.logger.error('Failed to load native canvas bindings.', error as any);
    }

    throw new Error('Canvas runtime unavailable. Run `npm rebuild canvas --build-from-source` on this server.');
  }

  private isRealCanvasRuntime(runtime: Partial<CanvasRuntime> | undefined): runtime is CanvasRuntime {
    try {
      const canvas = runtime?.createCanvas?.(4, 4);
      const ctx = canvas?.getContext?.('2d');

      return Boolean(
        canvas &&
        typeof canvas.toBuffer === 'function' &&
        ctx &&
        typeof ctx.createLinearGradient === 'function' &&
        typeof runtime?.registerFont === 'function' &&
        typeof runtime?.loadImage === 'function',
      );
    } catch {
      return false;
    }
  }

  private registerFonts(): void {
    try {
      const fontsDir = path.join(process.cwd(), 'assets', 'fonts');
      const boldFont = path.join(fontsDir, 'Roboto-Bold.ttf');
      const regularFont = path.join(fontsDir, 'Roboto-Regular.ttf');

      if (fs.existsSync(boldFont) && fs.existsSync(regularFont)) {
        try {
          this.canvasRuntime.registerFont(boldFont, { family: 'Roboto', weight: 'bold' });
          this.canvasRuntime.registerFont(regularFont, { family: 'Roboto', weight: 'normal' });
          this.logger.log('Fonts registered');
        } catch {
          this.logger.warn('Using system fonts');
        }
      }
    } catch {
      this.logger.warn('Font registration failed');
    }
  }

  async generateNameCard(name: string, meaning: string, gender?: 'boy' | 'girl'): Promise<Buffer> {
    const safeName = this.normalizeName(name);
    const safeMeaning = this.normalizeMeaning(meaning);

    if (gender === 'girl') {
      return this.generateGirlNameCard(safeName, safeMeaning);
    }

    return this.generateBoyNameCard(safeName, safeMeaning);
  }

  private async generateBoyNameCard(name: string, meaning: string): Promise<Buffer> {
    const canvas = this.canvasRuntime.createCanvas(this.boyCard.width, this.boyCard.height);
    const ctx = canvas.getContext('2d');

    await this.drawBoyBackground(ctx);
    this.drawBoyOverlays(ctx);
    this.drawBoyNamePlate(ctx, name);
    this.drawBoyMeaningPanel(ctx, meaning);
    this.drawBoyBotUsername(ctx);
    this.applyRoundedMask(ctx, this.boyCard.width, this.boyCard.height, this.boyCard.radius);

    return canvas.toBuffer('image/png');
  }

  private async generateGirlNameCard(name: string, meaning: string): Promise<Buffer> {
    const canvas = this.canvasRuntime.createCanvas(this.girlCard.width, this.girlCard.height);
    const ctx = canvas.getContext('2d');

    await this.drawGirlBackground(ctx);
    this.drawGirlOverlays(ctx);
    this.drawGirlNameChip(ctx, name);
    this.drawGirlMeaningPanel(ctx, meaning);
    this.drawGirlBotUsername(ctx);
    this.applyRoundedMask(ctx, this.girlCard.width, this.girlCard.height, this.girlCard.radius);

    return canvas.toBuffer('image/png');
  }

  private async generateClassicNameCard(name: string, meaning: string): Promise<Buffer> {
    const canvas = this.canvasRuntime.createCanvas(this.defaultCard.width, this.defaultCard.height);
    const ctx = canvas.getContext('2d');

    this.drawClassicGradientBackground(ctx);
    this.drawClassicNameBox(ctx, name);
    this.drawClassicMeaningBox(ctx, meaning);
    this.drawClassicBotUsername(ctx);
    this.applyRoundedMask(ctx, this.defaultCard.width, this.defaultCard.height, this.defaultCard.radius);

    return canvas.toBuffer('image/png');
  }

  private normalizeName(name: string): string {
    return (name || '').trim() || 'Ism';
  }

  private normalizeMeaning(meaning: string): string {
    const compact = (meaning || '')
      .replace(/\s+/g, ' ')
      .replace(/^Ma'nosi:\s*/i, '')
      .trim();

    return compact || "Ma'no topilmadi";
  }

  private async drawGirlBackground(ctx: CanvasContext): Promise<void> {
    if (fs.existsSync(this.girlTemplatePath)) {
      try {
        const image = await this.canvasRuntime.loadImage(this.girlTemplatePath);
        this.drawCoverImage(ctx, image, this.girlCard.width, this.girlCard.height);
        return;
      } catch (error) {
        this.logger.warn(`Girl template could not be loaded, using fallback background. ${String(error)}`);
      }
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, this.girlCard.height);
    gradient.addColorStop(0, '#071d3d');
    gradient.addColorStop(0.38, '#113f68');
    gradient.addColorStop(0.72, '#330a4d');
    gradient.addColorStop(1, '#11061f');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.girlCard.width, this.girlCard.height);
  }

  private async drawBoyBackground(ctx: CanvasContext): Promise<void> {
    if (fs.existsSync(this.boyTemplatePath)) {
      try {
        const image = await this.canvasRuntime.loadImage(this.boyTemplatePath);
        this.drawCoverImage(ctx, image, this.boyCard.width, this.boyCard.height);
        return;
      } catch (error) {
        this.logger.warn(`Boy template could not be loaded, using fallback background. ${String(error)}`);
      }
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, this.boyCard.height);
    gradient.addColorStop(0, '#071018');
    gradient.addColorStop(0.38, '#0f2430');
    gradient.addColorStop(0.72, '#071219');
    gradient.addColorStop(1, '#03070b');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.boyCard.width, this.boyCard.height);
  }

  private drawBoyOverlays(ctx: CanvasContext): void {
    const skyShade = ctx.createLinearGradient(0, 0, 0, this.boyCard.height * 0.44);
    skyShade.addColorStop(0, 'rgba(8, 19, 30, 0.10)');
    skyShade.addColorStop(0.48, 'rgba(8, 19, 30, 0.24)');
    skyShade.addColorStop(1, 'rgba(8, 19, 30, 0.56)');
    ctx.fillStyle = skyShade;
    ctx.fillRect(0, 0, this.boyCard.width, this.boyCard.height);

    const centralGlow = ctx.createRadialGradient(
      this.boyCard.width / 2,
      this.boyCard.height * 0.42,
      30,
      this.boyCard.width / 2,
      this.boyCard.height * 0.42,
      this.boyCard.width * 0.52,
    );
    centralGlow.addColorStop(0, 'rgba(244, 210, 154, 0.12)');
    centralGlow.addColorStop(0.4, 'rgba(244, 210, 154, 0.07)');
    centralGlow.addColorStop(1, 'rgba(244, 210, 154, 0)');
    ctx.fillStyle = centralGlow;
    ctx.fillRect(0, 0, this.boyCard.width, this.boyCard.height);

    const lowerShade = ctx.createLinearGradient(0, this.boyCard.height * 0.5, 0, this.boyCard.height);
    lowerShade.addColorStop(0, 'rgba(6, 12, 18, 0.02)');
    lowerShade.addColorStop(0.32, 'rgba(6, 12, 18, 0.22)');
    lowerShade.addColorStop(0.68, 'rgba(6, 12, 18, 0.56)');
    lowerShade.addColorStop(1, 'rgba(5, 9, 14, 0.84)');
    ctx.fillStyle = lowerShade;
    ctx.fillRect(0, 0, this.boyCard.width, this.boyCard.height);

    const fogLayer = ctx.createLinearGradient(0, this.boyCard.height * 0.58, 0, this.boyCard.height * 0.86);
    fogLayer.addColorStop(0, 'rgba(255, 255, 255, 0)');
    fogLayer.addColorStop(0.45, 'rgba(235, 240, 244, 0.10)');
    fogLayer.addColorStop(1, 'rgba(235, 240, 244, 0)');
    ctx.fillStyle = fogLayer;
    ctx.fillRect(0, this.boyCard.height * 0.52, this.boyCard.width, this.boyCard.height * 0.34);

    this.drawBoyCenterAtmosphere(ctx);
  }

  private drawBoyNamePlate(ctx: CanvasContext, name: string): void {
    const panelX = 78;
    const panelY = 82;
    const panelWidth = this.boyCard.width - 156;
    const panelHeight = 242;
    const centerX = this.boyCard.width / 2;
    const fontSize = this.fitTextWidth(ctx, name, panelWidth - 120, 100, 58, 'bold');
    const metrics = ctx.measureText(name);
    const accentWidth = Math.min(Math.max(metrics.width + 130, 360), panelWidth - 88);
    const accentHeight = 120;
    const accentX = centerX - accentWidth / 2;
    const accentY = panelY + 44;

    ctx.save();
    ctx.shadowColor = 'rgba(5, 9, 13, 0.28)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 10;

    const fill = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelHeight);
    fill.addColorStop(0, 'rgba(20, 32, 42, 0.34)');
    fill.addColorStop(0.56, 'rgba(20, 32, 42, 0.42)');
    fill.addColorStop(1, 'rgba(20, 32, 42, 0.50)');
    ctx.fillStyle = fill;
    this.roundRect(ctx, panelX, panelY, panelWidth, panelHeight, 34);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.lineWidth = 1.2;
    this.roundRect(ctx, panelX, panelY, panelWidth, panelHeight, 34);
    ctx.stroke();

    const topHighlight = ctx.createLinearGradient(panelX, panelY, panelX, panelY + 72);
    topHighlight.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
    topHighlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = topHighlight;
    ctx.beginPath();
    this.roundRect(ctx, panelX + 8, panelY + 8, panelWidth - 16, 74, 28);
    ctx.fill();

    const accentFill = ctx.createLinearGradient(accentX, accentY, accentX, accentY + accentHeight);
    accentFill.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
    accentFill.addColorStop(0.42, 'rgba(242, 244, 245, 0.88)');
    accentFill.addColorStop(1, 'rgba(219, 224, 228, 0.80)');
    ctx.fillStyle = accentFill;
    this.roundRect(ctx, accentX, accentY, accentWidth, accentHeight, 30);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.24)';
    ctx.lineWidth = 1;
    this.roundRect(ctx, accentX, accentY, accentWidth, accentHeight, 30);
    ctx.stroke();

    ctx.fillStyle = '#14202A';
    ctx.font = `bold ${fontSize}px Roboto, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, centerX, accentY + accentHeight / 2 + 3);
  }

  private drawBoyMeaningPanel(ctx: CanvasContext, meaning: string): void {
    const panelX = 78;
    const panelY = 510;
    const panelWidth = this.boyCard.width - 156;
    const panelHeight = 1010;
    const centerX = this.boyCard.width / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(4, 8, 12, 0.22)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 12;

    const fill = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelHeight);
    fill.addColorStop(0, 'rgba(20, 32, 42, 0.24)');
    fill.addColorStop(0.58, 'rgba(20, 32, 42, 0.34)');
    fill.addColorStop(1, 'rgba(20, 32, 42, 0.40)');
    ctx.fillStyle = fill;
    this.roundRect(ctx, panelX, panelY, panelWidth, panelHeight, 36);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.lineWidth = 1.1;
    this.roundRect(ctx, panelX, panelY, panelWidth, panelHeight, 36);
    ctx.stroke();

    const topFade = ctx.createLinearGradient(panelX, panelY, panelX, panelY + 120);
    topFade.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
    topFade.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = topFade;
    this.roundRect(ctx, panelX + 10, panelY + 10, panelWidth - 20, 124, 28);
    ctx.fill();

    ctx.fillStyle = '#F8F6F1';
    ctx.font = 'bold 46px Roboto, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText("Ma'nosi", centerX, panelY + 86);

    this.drawBoyDivider(ctx, centerX, panelY + 146);

    const layout = this.getWrappedTextLayout(
      ctx,
      meaning,
      panelWidth - 128,
      panelHeight - 250,
      54,
      34,
      1.30,
      'normal',
    );

    ctx.fillStyle = '#F5F4F0';
    ctx.font = `${layout.fontSize}px Roboto, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const textStartY = panelY + 224 + ((panelHeight - 250) - layout.lines.length * layout.lineHeight) / 2;
    layout.lines.forEach((line, index) => {
      ctx.fillText(line, centerX, textStartY + index * layout.lineHeight);
    });
  }

  private drawBoyDivider(ctx: CanvasContext, centerX: number, y: number): void {
    ctx.save();
    const leftGradient = ctx.createLinearGradient(centerX - 160, y, centerX - 26, y);
    leftGradient.addColorStop(0, 'rgba(214, 196, 165, 0)');
    leftGradient.addColorStop(1, 'rgba(214, 196, 165, 0.92)');
    ctx.strokeStyle = leftGradient;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX - 138, y);
    ctx.lineTo(centerX - 26, y);
    ctx.stroke();

    const rightGradient = ctx.createLinearGradient(centerX + 26, y, centerX + 160, y);
    rightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.88)');
    rightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.strokeStyle = rightGradient;
    ctx.beginPath();
    ctx.moveTo(centerX + 26, y);
    ctx.lineTo(centerX + 138, y);
    ctx.stroke();

    ctx.fillStyle = '#D5C3A0';
    ctx.beginPath();
    ctx.arc(centerX, y, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.44)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(centerX - 9, y);
    ctx.lineTo(centerX, y - 9);
    ctx.lineTo(centerX + 9, y);
    ctx.lineTo(centerX, y + 9);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  private drawBoyCenterAtmosphere(ctx: CanvasContext): void {
    const centerX = this.boyCard.width / 2;
    const centerY = this.boyCard.height * 0.60;

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let index = 0; index < 6; index += 1) {
      const radiusX = 168 + index * 56;
      const radiusY = 30 + index * 14;
      ctx.beginPath();
      ctx.ellipse(centerX, centerY + index * 12, radiusX, radiusY, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    const beam = ctx.createLinearGradient(0, this.boyCard.height * 0.20, 0, this.boyCard.height * 0.84);
    beam.addColorStop(0, 'rgba(255, 255, 255, 0)');
    beam.addColorStop(0.42, 'rgba(255, 255, 255, 0.05)');
    beam.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(centerX - 140, this.boyCard.height * 0.22);
    ctx.lineTo(centerX + 140, this.boyCard.height * 0.22);
    ctx.lineTo(centerX + 320, this.boyCard.height * 0.86);
    ctx.lineTo(centerX - 320, this.boyCard.height * 0.86);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawBoyBotUsername(ctx: CanvasContext): void {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.74)';
    ctx.font = '28px Roboto, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('@ismlarimizmanolari_bot', this.boyCard.width / 2, this.boyCard.height - 72);
  }

  private drawGirlOverlays(ctx: CanvasContext): void {
    const topGlow = ctx.createRadialGradient(
      this.girlCard.width / 2,
      this.girlCard.height * 0.2,
      20,
      this.girlCard.width / 2,
      this.girlCard.height * 0.2,
      this.girlCard.width * 0.5,
    );
    topGlow.addColorStop(0, 'rgba(132, 233, 255, 0.18)');
    topGlow.addColorStop(1, 'rgba(132, 233, 255, 0)');
    ctx.fillStyle = topGlow;
    ctx.fillRect(0, 0, this.girlCard.width, this.girlCard.height);

    const lowerShade = ctx.createLinearGradient(0, this.girlCard.height * 0.52, 0, this.girlCard.height);
    lowerShade.addColorStop(0, 'rgba(15, 7, 40, 0.08)');
    lowerShade.addColorStop(0.5, 'rgba(15, 7, 40, 0.34)');
    lowerShade.addColorStop(1, 'rgba(4, 3, 16, 0.74)');
    ctx.fillStyle = lowerShade;
    ctx.fillRect(0, this.girlCard.height * 0.52, this.girlCard.width, this.girlCard.height * 0.48);

    const vignette = ctx.createRadialGradient(
      this.girlCard.width / 2,
      this.girlCard.height * 0.48,
      this.girlCard.width * 0.22,
      this.girlCard.width / 2,
      this.girlCard.height * 0.48,
      this.girlCard.height * 0.72,
    );
    vignette.addColorStop(0, 'rgba(255, 255, 255, 0)');
    vignette.addColorStop(1, 'rgba(4, 2, 17, 0.38)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, this.girlCard.width, this.girlCard.height);
  }

  private drawGirlNameChip(ctx: CanvasContext, name: string): void {
    const centerX = this.girlCard.width / 2;
    const chipY = 188;
    const fontSize = this.fitTextWidth(ctx, name, 520, 92, 52, 'bold');
    const metrics = ctx.measureText(name);
    const chipWidth = Math.min(Math.max(metrics.width + 140, 360), this.girlCard.width - 140);
    const chipHeight = 132;
    const chipX = centerX - chipWidth / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(8, 6, 22, 0.32)';
    ctx.shadowBlur = 34;
    ctx.shadowOffsetY = 18;

    const fill = ctx.createLinearGradient(chipX, chipY, chipX, chipY + chipHeight);
    fill.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
    fill.addColorStop(1, 'rgba(248, 240, 246, 0.96)');
    ctx.fillStyle = fill;
    this.roundRect(ctx, chipX, chipY, chipWidth, chipHeight, 34);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    ctx.strokeStyle = 'rgba(255, 214, 231, 0.85)';
    ctx.lineWidth = 2;
    this.roundRect(ctx, chipX, chipY, chipWidth, chipHeight, 34);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#28344E';
    ctx.font = `bold ${fontSize}px Roboto, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, centerX, chipY + chipHeight / 2 + 2);
  }

  private drawGirlMeaningPanel(ctx: CanvasContext, meaning: string): void {
    const panelX = 72;
    const panelY = 908;
    const panelWidth = this.girlCard.width - 144;
    const panelHeight = 430;
    const centerX = this.girlCard.width / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
    ctx.shadowBlur = 38;
    ctx.shadowOffsetY = 16;
    ctx.fillStyle = 'rgba(11, 8, 32, 0.52)';
    this.roundRect(ctx, panelX, panelY, panelWidth, panelHeight, 34);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(255, 214, 228, 0.42)';
    ctx.lineWidth = 1.5;
    this.roundRect(ctx, panelX, panelY, panelWidth, panelHeight, 34);
    ctx.stroke();

    ctx.fillStyle = '#FDECF7';
    ctx.font = 'bold 40px Roboto, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText("Ma'nosi", centerX, panelY + 74);

    this.drawGirlDivider(ctx, centerX, panelY + 122);

    const layout = this.getWrappedTextLayout(
      ctx,
      meaning,
      panelWidth - 120,
      panelHeight - 200,
      46,
      30,
      1.34,
      'normal',
    );

    ctx.fillStyle = '#FFF7FB';
    ctx.font = `${layout.fontSize}px Roboto, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const textStartY = panelY + 162 + ((panelHeight - 200) - layout.lines.length * layout.lineHeight) / 2;
    layout.lines.forEach((line, index) => {
      ctx.fillText(line, centerX, textStartY + index * layout.lineHeight);
    });
  }

  private drawGirlDivider(ctx: CanvasContext, centerX: number, y: number): void {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 221, 232, 0.84)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX - 120, y);
    ctx.lineTo(centerX - 26, y);
    ctx.moveTo(centerX + 26, y);
    ctx.lineTo(centerX + 120, y);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 236, 244, 0.96)';
    ctx.beginPath();
    ctx.moveTo(centerX, y - 10);
    ctx.lineTo(centerX + 10, y);
    ctx.lineTo(centerX, y + 10);
    ctx.lineTo(centerX - 10, y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawGirlBotUsername(ctx: CanvasContext): void {
    ctx.fillStyle = 'rgba(255, 236, 246, 0.88)';
    ctx.font = '26px Roboto, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('@ismlarimizmanolari_bot', this.girlCard.width / 2, this.girlCard.height - 92);
  }

  private drawClassicGradientBackground(ctx: CanvasContext): void {
    const gradientHeight = this.defaultCard.height * 0.5;
    const gradient = ctx.createLinearGradient(0, 0, 0, gradientHeight);
    gradient.addColorStop(0, '#E5E7EB');
    gradient.addColorStop(0.5, '#D1D5DB');
    gradient.addColorStop(1, '#9CA3AF');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.defaultCard.width, gradientHeight);

    this.drawIslamicPattern(ctx, gradientHeight);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, gradientHeight, this.defaultCard.width, this.defaultCard.height - gradientHeight);
  }

  private drawClassicNameBox(ctx: CanvasContext, name: string): void {
    const centerX = this.defaultCard.width / 2;
    const centerY = 160;
    const fontSize = this.fitTextWidth(ctx, name, this.defaultCard.width - 160, 70, 40, 'bold');

    ctx.font = `bold ${fontSize}px Roboto, Arial, sans-serif`;
    const nameWidth = ctx.measureText(name).width;
    const boxPadding = 50;
    const boxWidth = Math.min(nameWidth + boxPadding * 2, this.defaultCard.width - 60);
    const boxHeight = 100;
    const boxX = centerX - boxWidth / 2;
    const boxY = centerY - boxHeight / 2;

    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetY = 4;

    ctx.fillStyle = '#FFFFFF';
    this.roundRect(ctx, boxX, boxY, boxWidth, boxHeight, 20);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    ctx.fillStyle = '#374151';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, centerX, centerY);
  }

  private drawClassicMeaningBox(ctx: CanvasContext, meaning: string): void {
    const centerX = this.defaultCard.width / 2;
    const startY = 480;

    ctx.fillStyle = '#4B5563';
    ctx.font = 'bold 24px Roboto, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText("Ma'nosi:", centerX, startY);

    const layout = this.getWrappedTextLayout(
      ctx,
      meaning,
      this.defaultCard.width - 100,
      150,
      24,
      18,
      1.46,
      'normal',
    );

    ctx.fillStyle = '#1F2937';
    ctx.font = `${layout.fontSize}px Roboto, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    layout.lines.forEach((line, index) => {
      const textY = startY + 34 + index * layout.lineHeight;
      ctx.fillText(line, centerX, textY);
    });
  }

  private drawClassicBotUsername(ctx: CanvasContext): void {
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '20px Roboto, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('@ismlarimizmanolari_bot', this.defaultCard.width / 2, this.defaultCard.height - 50);
  }

  private drawIslamicPattern(ctx: CanvasContext, height: number): void {
    ctx.globalAlpha = 0.15;

    const centerX = this.defaultCard.width / 2;
    const centerY = height / 2;
    const size = 200;

    ctx.save();
    ctx.translate(centerX, centerY);

    const primaryColor = '#D1A87C';
    const secondaryColor = '#9CA3AF';

    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 3;

    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const angle = (i * Math.PI) / 4;
      const x = Math.cos(angle) * size;
      const y = Math.sin(angle) * size;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
    ctx.stroke();

    for (let i = 0; i < 8; i += 1) {
      const angle = (i * Math.PI) / 4;

      ctx.save();
      ctx.rotate(angle);

      ctx.beginPath();
      ctx.moveTo(0, -size * 0.3);
      ctx.quadraticCurveTo(size * 0.4, -size * 0.6, size * 0.3, -size);
      ctx.quadraticCurveTo(0, -size * 0.8, -size * 0.3, -size);
      ctx.quadraticCurveTo(-size * 0.4, -size * 0.6, 0, -size * 0.3);
      ctx.closePath();
      ctx.stroke();

      ctx.strokeStyle = secondaryColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-size * 0.15, -size * 0.5);
      ctx.lineTo(size * 0.15, -size * 0.7);
      ctx.moveTo(size * 0.15, -size * 0.5);
      ctx.lineTo(-size * 0.15, -size * 0.7);
      ctx.stroke();

      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = 3;
      ctx.restore();
    }

    ctx.fillStyle = primaryColor;
    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const angle = (i * Math.PI) / 4;
      const radius = i % 2 === 0 ? 40 : 20;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = secondaryColor;
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private drawCoverImage(ctx: CanvasContext, image: CanvasImage, targetWidth: number, targetHeight: number): void {
    const scale = Math.max(targetWidth / image.width, targetHeight / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const offsetX = (targetWidth - drawWidth) / 2;
    const offsetY = (targetHeight - drawHeight) / 2;

    ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
  }

  private fitTextWidth(
    ctx: CanvasContext,
    text: string,
    maxWidth: number,
    startSize: number,
    minSize: number,
    weight: 'normal' | 'bold',
  ): number {
    for (let size = startSize; size >= minSize; size -= 2) {
      ctx.font = `${weight} ${size}px Roboto, Arial, sans-serif`;
      if (ctx.measureText(text).width <= maxWidth) {
        return size;
      }
    }

    return minSize;
  }

  private getWrappedTextLayout(
    ctx: CanvasContext,
    text: string,
    maxWidth: number,
    maxHeight: number,
    startFontSize: number,
    minFontSize: number,
    lineHeightRatio: number,
    weight: 'normal' | 'bold',
  ): WrappedTextLayout {
    for (let fontSize = startFontSize; fontSize >= minFontSize; fontSize -= 2) {
      ctx.font = `${weight} ${fontSize}px Roboto, Arial, sans-serif`;
      const lines = this.wrapText(ctx, text, maxWidth);
      const lineHeight = Math.round(fontSize * lineHeightRatio);

      if (lines.length * lineHeight <= maxHeight) {
        return { lines, fontSize, lineHeight };
      }
    }

    const fallbackFontSize = minFontSize;
    ctx.font = `${weight} ${fallbackFontSize}px Roboto, Arial, sans-serif`;
    return {
      lines: this.wrapText(ctx, text, maxWidth),
      fontSize: fallbackFontSize,
      lineHeight: Math.round(fallbackFontSize * lineHeightRatio),
    };
  }

  private wrapText(ctx: CanvasContext, text: string, maxWidth: number): string[] {
    const words = text.split(' ').filter(Boolean);
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);

      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines.length ? lines : [text];
  }

  private applyRoundedMask(ctx: CanvasContext, width: number, height: number, radius: number): void {
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = '#000000';
    this.roundRect(ctx, 0, 0, width, height, radius);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  private roundRect(ctx: CanvasContext, x: number, y: number, width: number, height: number, radius: number): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.arcTo(x + width, y, x + width, y + radius, radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
    ctx.lineTo(x + radius, y + height);
    ctx.arcTo(x, y + height, x, y + height - radius, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();
  }
}
