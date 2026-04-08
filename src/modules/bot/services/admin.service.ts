import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Context, InputFile } from 'grammy';
import {
    UserEntity,
    TransactionEntity,
    ActivityLogEntity,
    ActivityType,
    RequestedNameEntity,
} from '../../../shared/database/entities';
import { TransactionStatus } from '../../../shared/database/entities/enums';
import logger from '../../../shared/utils/logger';
import { ActivityTrackerService } from './activity-tracker.service';

// Admin telegram IDs
const ADMIN_IDS = [7789445876, 1083408, 85939027];

interface TrafficSummary {
    totalAttributedUsers: number;
    paidUsers: number;
    activeSubscribers: number;
    totalRevenue: number;
    todayNewUsers: number;
    weekNewUsers: number;
}

interface TrafficSourceRow {
    source: string;
    newUsers: number;
    todayNewUsers: number;
    weekNewUsers: number;
    totalStarts: number;
    paidUsers: number;
    payments: number;
    activeSubscribers: number;
    revenue: number;
}

@Injectable()
export class AdminService {
    constructor(
        @InjectRepository(UserEntity)
        private readonly userRepository: Repository<UserEntity>,
        @InjectRepository(TransactionEntity)
        private readonly transactionRepository: Repository<TransactionEntity>,
        @InjectRepository(ActivityLogEntity)
        private readonly activityRepository: Repository<ActivityLogEntity>,
        @InjectRepository(RequestedNameEntity)
        private readonly requestedNameRepository: Repository<RequestedNameEntity>,
        private readonly activityTracker: ActivityTrackerService,
    ) { }

    isAdmin(telegramId: number): boolean {
        return ADMIN_IDS.includes(telegramId);
    }

    async handleAdminCommand(ctx: Context, command: string): Promise<void> {
        const telegramId = ctx.from?.id;
        if (!telegramId || !this.isAdmin(telegramId)) {
            await ctx.reply('❌ Sizda admin huquqlari yo\'q!');
            return;
        }

        const parts = ctx.message?.text?.split(' ') || [];

        switch (command) {
            case 'stats':
                await this.sendDetailedStats(ctx);
                break;

            case 'activity':
                await this.sendActivityStats(ctx);
                break;

            case 'traffic':
                await this.sendTrafficStats(ctx);
                break;

            case 'funnel':
                await this.sendPaymentFunnel(ctx);
                break;

            case 'users_active':
                await this.sendTopActiveUsers(ctx);
                break;

            case 'daily':
                await this.sendDailyStats(ctx);
                break;

            case 'ismlar':
                await this.showRequestedNames(ctx);
                break;

            case 'grant':
                if (parts.length < 2) {
                    await ctx.reply('❌ Format: /grant <telegram_id>');
                    return;
                }
                await this.grantSubscription(ctx, parts[1]);
                break;

            case 'revoke':
                if (parts.length < 2) {
                    await ctx.reply('❌ Format: /revoke <telegram_id>');
                    return;
                }
                await this.revokeSubscription(ctx, parts[1]);
                break;

            case 'find':
                if (parts.length < 2) {
                    await ctx.reply('❌ Format: /find <telegram_id or name>');
                    return;
                }
                await this.findUser(ctx, parts[1]);
                break;

            case 'help':
            default:
                await this.showAdminPanel(ctx);
        }
    }

    private async showAdminPanel(ctx: Context): Promise<void> {
        await ctx.reply(
            '🔧 <b>ADMIN PANEL</b>\n\n' +
            '📊 Statistika va boshqaruv tizimi\n\n' +
            '<b>Mavjud komandalar:</b>\n\n' +
            '<b>📊 Statistika:</b>\n' +
            '/stats - Umumiy statistika\n' +
            '/traffic - Kanal va reklama statistikasi\n' +
            '/activity - Faollik statistikasi\n' +
            '/funnel - To\'lov voronkasi\n' +
            '/users_active - Eng faol foydalanuvchilar\n' +
            '/daily - Kunlik statistika (7 kun)\n' +
            '/ismlar - Ma\'lumotlar bazasida yo\'q ismlar\n\n' +
            '<b>👥 Boshqaruv:</b>\n' +
            '/grant <telegram_id> - 1 yillik obuna berish\n' +
            '/find <telegram_id> - Foydalanuvchini topish',
            { parse_mode: 'HTML' }
        );
    }

    async handleAdminCallback(ctx: Context, action: string): Promise<void> {
        const telegramId = ctx.from?.id;
        if (!telegramId || !this.isAdmin(telegramId)) {
            await ctx.answerCallbackQuery('❌ Sizda admin huquqlari yo\'q!');
            return;
        }

        switch (action) {
            case 'stats':
                await this.sendDetailedStats(ctx);
                break;
            case 'users':
                await this.sendUserStats(ctx);
                break;
            case 'payments':
                await this.sendPaymentStats(ctx);
                break;
            case 'activity':
                await this.sendActivityStats(ctx);
                break;
            case 'chart':
                await this.sendChartStats(ctx);
                break;
            default:
                await this.showAdminPanel(ctx);
        }

        await ctx.answerCallbackQuery();
    }

    private async sendDetailedStats(ctx: Context): Promise<void> {
        try {
            // Total users
            const totalUsers = await this.userRepository.count();

            // New users today
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const newUsersToday = await this.userRepository.count({
                where: {
                    createdAt: MoreThan(today),
                },
            });

            // Active subscriptions
            const activeSubscriptions = await this.userRepository.count({
                where: {
                    isActive: true,
                    subscriptionEnd: MoreThan(new Date()),
                },
            });

            // Total revenue
            const paidTransactions = await this.transactionRepository.find({
                where: { status: TransactionStatus.PAID },
            });
            const totalRevenue = paidTransactions.reduce((sum, t) => sum + (t.amount || 0), 0) / 100; // Convert tiyin to som
            const todayRevenue = paidTransactions
                .filter(t => t.performTime && new Date(t.performTime) >= today)
                .reduce((sum, t) => sum + (t.amount || 0), 0) / 100; // Convert tiyin to som

            // Payment providers stats
            const clickPayments = paidTransactions.filter(t => t.provider === 'click').length;
            const paymePayments = paidTransactions.filter(t => t.provider === 'payme').length;



            // Bot Commands
            const startCommands = await this.activityRepository.count({
                where: { activityType: ActivityType.START_COMMAND },
            });

            const nameSearches = await this.activityRepository.count({
                where: { activityType: ActivityType.NAME_SEARCHED },
            });

            // Inline Keyboard Clicks
            const nameMeaningClicks = await this.activityRepository.count({
                where: { activityType: ActivityType.NAME_MEANING_CLICK },
            });

            const personalTavsiyaClicks = await this.activityRepository.count({
                where: { activityType: ActivityType.PERSONAL_TAVSIYA_CLICK },
            });

            const trendsClicks = await this.activityRepository.count({
                where: { activityType: ActivityType.TRENDS_CLICK },
            });

            const favoritesClicks = await this.activityRepository.count({
                where: { activityType: ActivityType.FAVORITES_CLICK },
            });

            // Payment Actions
            const paymentScreens = await this.activityRepository.count({
                where: { activityType: ActivityType.PAYMENT_SCREEN_OPENED },
            });

            const paymeClicks = await this.activityRepository.count({
                where: { activityType: ActivityType.PAYME_CLICKED },
            });

            const clickClicks = await this.activityRepository.count({
                where: { activityType: ActivityType.CLICK_CLICKED },
            });

            const successfulPayments = await this.activityRepository.count({
                where: { activityType: ActivityType.PAYMENT_SUCCESS },
            });

            const cancelledPayments = await this.activityRepository.count({
                where: { activityType: ActivityType.PAYMENT_FAILED },
            });

            // Calculate conversion rate
            const totalPaymentAttempts = paymentScreens;
            const conversionRate = totalPaymentAttempts > 0
                ? ((successfulPayments / totalPaymentAttempts) * 100).toFixed(1)
                : '0.0';

            let statsMessage =
                '📊 <b>BATAFSIL STATISTIKA</b>\n\n' +
                '👥 <b>FOYDALANUVCHILAR:</b>\n' +
                `├ Jami: <b>${totalUsers}</b>\n` +
                `├ Bugun yangi: <b>${newUsersToday}</b>\n` +
                `└ Aktiv obunalar: <b>${activeSubscriptions}</b> (${((activeSubscriptions / totalUsers) * 100).toFixed(1)}%)\n\n` +
                '💰 <b>MOLIYAVIY:</b>\n' +
                `├ Jami daromad: <b>${(totalRevenue || 0).toLocaleString('uz-UZ')} so'm</b>\n` +
                `├ Bugun: <b>${(todayRevenue || 0).toLocaleString('uz-UZ')} so'm</b>\n` +
                `├ Jami to'lovlar: <b>${paidTransactions.length}</b>\n` +
                `├ Click: <b>${clickPayments}</b>\n` +
                `└ Payme: <b>${paymePayments}</b>\n\n` +
                '📱 <b>BOT KOMANDALAR:</b>\n' +
                `├ /start: <b>${startCommands}</b>\n` +
                `└ Ism qidiruvlar: <b>${nameSearches}</b>\n\n` +
                '⌨️ <b>INLINE KEYBOARD BOSISHLAR:</b>\n' +
                `├ 🔍 Ism Ma'nosi: <b>${nameMeaningClicks}</b>\n` +
                `├ 🎯 Shaxsiy Tavsiya: <b>${personalTavsiyaClicks}</b>\n` +
                `├ 📊 Trendlar: <b>${trendsClicks}</b>\n` +
                `└ ⭐ Sevimlilar: <b>${favoritesClicks}</b>\n\n` +
                '💳 <b>TO\'LOV HARAKATLARI:</b>\n' +
                `├ To'lov ekrani: <b>${paymentScreens}</b>\n` +
                `├ Payme: <b>${paymeClicks}</b>\n` +
                `├ Click: <b>${clickClicks}</b>\n` +
                `├ ✅ Muvaffaqiyatli: <b>${successfulPayments}</b>\n` +
                `└ ❌ Bekor qilindi: <b>${cancelledPayments}</b>\n\n` +
                `💡 <b>Konversiya:</b> ${conversionRate}%\n\n` +
                `📅 Sana: ${new Date().toLocaleString('uz-UZ')}`;

            await ctx.reply(statsMessage, { parse_mode: 'HTML' });
        } catch (error) {
            logger.error('Admin detailed stats error:', error);
            await ctx.reply('❌ Statistikani yuklashda xatolik!');
        }
    }

    private async sendUserStats(ctx: Context): Promise<void> {
        try {
            const totalUsers = await this.userRepository.count();
            const activeUsers = await this.userRepository.count({
                where: { isActive: true, subscriptionEnd: MoreThan(new Date()) },
            });

            // Last 7 days registration
            const last7Days = new Date();
            last7Days.setDate(last7Days.getDate() - 7);
            const newUsersWeek = await this.userRepository.count({
                where: { createdAt: MoreThan(last7Days) },
            });

            // Last 30 days
            const last30Days = new Date();
            last30Days.setDate(last30Days.getDate() - 30);
            const newUsersMonth = await this.userRepository.count({
                where: { createdAt: MoreThan(last30Days) },
            });

            const conversionRate = totalUsers > 0 ? ((activeUsers / totalUsers) * 100).toFixed(2) : '0';

            const message =
                '👥 <b>FOYDALANUVCHILAR STATISTIKASI</b>\n\n' +
                `📈 Jami: <b>${totalUsers}</b>\n` +
                `✅ Premium: <b>${activeUsers}</b>\n` +
                `👤 Oddiy: <b>${totalUsers - activeUsers}</b>\n\n` +
                `📅 So'nggi 7 kun: <b>+${newUsersWeek}</b>\n` +
                `📅 So'nggi 30 kun: <b>+${newUsersMonth}</b>\n\n` +
                `💎 Konversiya: <b>${conversionRate}%</b>`;

            await ctx.reply(message, { parse_mode: 'HTML' });
        } catch (error) {
            logger.error('User stats error:', error);
            await ctx.reply('❌ Statistikani yuklashda xatolik!');
        }
    }

    private async sendTrafficStats(ctx: Context): Promise<void> {
        try {
            const { summary, sources } = await this.getTrafficStats();

            if (!summary.totalAttributedUsers) {
                await ctx.reply(
                    '🚦 <b>TRAFIK STATISTIKASI</b>\n\n' +
                    'Hozircha source bilan kelgan yangi foydalanuvchilar log qilinmagan.\n\n' +
                    'Reklama uchun linklarni shu formatda ishlating:\n' +
                    '<code>https://t.me/ismlarimizmanolari_bot?start=instagram</code>\n' +
                    '<code>https://t.me/ismlarimizmanolari_bot?start=telegramkanal__aprel</code>',
                    { parse_mode: 'HTML' },
                );
                return;
            }

            let message =
                '🚦 <b>TRAFIK STATISTIKASI</b>\n\n' +
                `👥 Attributed yangi users: <b>${summary.totalAttributedUsers}</b>\n` +
                `📅 Bugun qo'shilganlar: <b>${summary.todayNewUsers}</b>\n` +
                `🗓 So'nggi 7 kun: <b>${summary.weekNewUsers}</b>\n` +
                `💳 To'lov qilgan users: <b>${summary.paidUsers}</b>\n` +
                `✅ Aktiv obunachilar: <b>${summary.activeSubscribers}</b>\n` +
                `💰 Daromad: <b>${summary.totalRevenue.toLocaleString('uz-UZ')} so'm</b>\n\n` +
                '<b>Top manbalar:</b>\n';

            sources.forEach((source, index) => {
                message += `\n${index + 1}. <b>${source.source}</b>\n`;
                message += `├ Yangi users: <b>${source.newUsers}</b>\n`;
                message += `├ Bugun: <b>${source.todayNewUsers}</b>\n`;
                message += `├ 7 kun: <b>${source.weekNewUsers}</b>\n`;
                message += `├ /start lar: <b>${source.totalStarts}</b>\n`;
                message += `├ To'lov qilganlar: <b>${source.paidUsers}</b>\n`;
                message += `├ Aktiv obuna: <b>${source.activeSubscribers}</b>\n`;
                message += `└ Daromad: <b>${source.revenue.toLocaleString('uz-UZ')} so'm</b>\n`;
            });

            message +=
                '\nReklama link namunasi:\n' +
                '<code>?start=instagram</code>\n' +
                '<code>?start=telegramkanal__aprel</code>';

            await ctx.reply(message, { parse_mode: 'HTML' });
        } catch (error) {
            logger.error('Traffic stats error:', error);
            await ctx.reply('❌ Trafik statistikasini yuklashda xatolik!');
        }
    }

    private async getTrafficStats(limit: number = 10): Promise<{
        summary: TrafficSummary;
        sources: TrafficSourceRow[];
    }> {
        const summaryRows = await this.activityRepository.query(
            `
                WITH first_attribution AS (
                    SELECT DISTINCT ON (a.telegram_id)
                        a.telegram_id,
                        COALESCE(NULLIF(a.metadata->>'source', ''), 'organic') AS source,
                        a.created_at AS first_start_at
                    FROM activity_logs a
                    WHERE a.activity_type = 'start_command'
                      AND COALESCE((a.metadata->>'isNewUser')::boolean, false) = true
                    ORDER BY a.telegram_id, a.created_at ASC
                )
                SELECT
                    COUNT(DISTINCT fa.telegram_id)::int AS "totalAttributedUsers",
                    COUNT(DISTINCT t."userId") FILTER (WHERE t.status = $1)::int AS "paidUsers",
                    COUNT(DISTINCT u.id) FILTER (
                        WHERE u."isActive" = true
                          AND u."subscriptionEnd" IS NOT NULL
                          AND u."subscriptionEnd" > NOW()
                    )::int AS "activeSubscribers",
                    COALESCE(SUM(CASE WHEN t.status = $1 THEN t.amount ELSE 0 END), 0)::numeric AS "totalRevenue",
                    COUNT(DISTINCT fa.telegram_id) FILTER (WHERE first_start_at >= CURRENT_DATE)::int AS "todayNewUsers",
                    COUNT(DISTINCT fa.telegram_id) FILTER (WHERE first_start_at >= NOW() - INTERVAL '7 days')::int AS "weekNewUsers"
                FROM first_attribution fa
                LEFT JOIN users u ON u."telegramId" = fa.telegram_id
                LEFT JOIN transactions t ON t."userId" = u.id;
            `,
            [TransactionStatus.PAID],
        );

        const sourceRows = await this.activityRepository.query(
            `
                WITH first_attribution AS (
                    SELECT DISTINCT ON (a.telegram_id)
                        a.telegram_id,
                        COALESCE(NULLIF(a.metadata->>'source', ''), 'organic') AS source,
                        a.created_at AS first_start_at
                    FROM activity_logs a
                    WHERE a.activity_type = 'start_command'
                      AND COALESCE((a.metadata->>'isNewUser')::boolean, false) = true
                    ORDER BY a.telegram_id, a.created_at ASC
                ),
                source_starts AS (
                    SELECT
                        COALESCE(NULLIF(a.metadata->>'source', ''), 'organic') AS source,
                        COUNT(*)::int AS total_starts
                    FROM activity_logs a
                    WHERE a.activity_type = 'start_command'
                    GROUP BY 1
                )
                SELECT
                    fa.source,
                    COUNT(DISTINCT fa.telegram_id)::int AS "newUsers",
                    COUNT(DISTINCT fa.telegram_id) FILTER (WHERE fa.first_start_at >= CURRENT_DATE)::int AS "todayNewUsers",
                    COUNT(DISTINCT fa.telegram_id) FILTER (WHERE fa.first_start_at >= NOW() - INTERVAL '7 days')::int AS "weekNewUsers",
                    COALESCE(MAX(ss.total_starts), 0)::int AS "totalStarts",
                    COUNT(DISTINCT t."userId") FILTER (WHERE t.status = $1)::int AS "paidUsers",
                    COUNT(t.id) FILTER (WHERE t.status = $1)::int AS payments,
                    COUNT(DISTINCT u.id) FILTER (
                        WHERE u."isActive" = true
                          AND u."subscriptionEnd" IS NOT NULL
                          AND u."subscriptionEnd" > NOW()
                    )::int AS "activeSubscribers",
                    COALESCE(SUM(CASE WHEN t.status = $1 THEN t.amount ELSE 0 END), 0)::numeric AS revenue
                FROM first_attribution fa
                LEFT JOIN users u ON u."telegramId" = fa.telegram_id
                LEFT JOIN transactions t ON t."userId" = u.id
                LEFT JOIN source_starts ss ON ss.source = fa.source
                GROUP BY fa.source
                ORDER BY "newUsers" DESC, revenue DESC, fa.source ASC
                LIMIT $2;
            `,
            [TransactionStatus.PAID, limit],
        );

        const summaryRow = summaryRows[0] ?? {};
        const summary: TrafficSummary = {
            totalAttributedUsers: Number(summaryRow.totalAttributedUsers || 0),
            paidUsers: Number(summaryRow.paidUsers || 0),
            activeSubscribers: Number(summaryRow.activeSubscribers || 0),
            totalRevenue: Number(summaryRow.totalRevenue || 0),
            todayNewUsers: Number(summaryRow.todayNewUsers || 0),
            weekNewUsers: Number(summaryRow.weekNewUsers || 0),
        };

        const sources: TrafficSourceRow[] = sourceRows.map((row: Record<string, unknown>) => ({
            source: String(row.source || 'organic'),
            newUsers: Number(row.newUsers || 0),
            todayNewUsers: Number(row.todayNewUsers || 0),
            weekNewUsers: Number(row.weekNewUsers || 0),
            totalStarts: Number(row.totalStarts || 0),
            paidUsers: Number(row.paidUsers || 0),
            payments: Number(row.payments || 0),
            activeSubscribers: Number(row.activeSubscribers || 0),
            revenue: Number(row.revenue || 0),
        }));

        return { summary, sources };
    }

    private async sendPaymentStats(ctx: Context): Promise<void> {
        try {
            const allTransactions = await this.transactionRepository.find();
            const paidTransactions = allTransactions.filter(t => t.status === TransactionStatus.PAID);
            const pendingTransactions = allTransactions.filter(t => t.status === TransactionStatus.PENDING);
            const failedTransactions = allTransactions.filter(t => t.status === TransactionStatus.FAILED);

            const totalRevenue = paidTransactions.reduce((sum, t) => sum + (t.amount || 0), 0) / 100; // Convert to som
            const avgTransaction = paidTransactions.length > 0
                ? (totalRevenue / paidTransactions.length).toFixed(0)
                : '0';

            // Today's transactions
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayTransactions = paidTransactions.filter(
                t => t.performTime && new Date(t.performTime) >= today
            );
            const todayRevenue = todayTransactions.reduce((sum, t) => sum + (t.amount || 0), 0) / 100; // Convert to som

            const message =
                '💰 <b>TO\'LOVLAR STATISTIKASI</b>\n\n' +
                `✅ Muvaffaqiyatli: <b>${paidTransactions.length}</b>\n` +
                `⏳ Kutilmoqda: <b>${pendingTransactions.length}</b>\n` +
                `❌ Bekor qilingan: <b>${failedTransactions.length}</b>\n\n` +
                `💵 Jami daromad: <b>${(totalRevenue || 0).toLocaleString('uz-UZ')} so'm</b>\n` +
                `📊 O'rtacha to'lov: <b>${avgTransaction} so'm</b>\n\n` +
                `📅 Bugun:\n` +
                `├ To'lovlar: <b>${todayTransactions.length}</b>\n` +
                `└ Daromad: <b>${(todayRevenue || 0).toLocaleString('uz-UZ')} so'm</b>`;

            await ctx.reply(message, { parse_mode: 'HTML' });
        } catch (error) {
            logger.error('Payment stats error:', error);
            await ctx.reply('❌ Statistikani yuklashda xatolik!');
        }
    }

    private async sendActivityStats(ctx: Context): Promise<void> {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            // Get inline keyboard stats
            const inlineStats = await this.activityTracker.getInlineKeyboardStats(today, tomorrow);

            // Count activities
            const startCommands = await this.activityRepository.count({
                where: { activityType: ActivityType.START_COMMAND, createdAt: MoreThan(today) },
            });

            const message =
                '🎯 <b>FAOLLIK STATISTIKASI (Bugun)</b>\n\n' +
                '<b>🤖 Bot komandalar:</b>\n' +
                `├ /start: <b>${startCommands}</b>\n` +
                '<b>⌨️ Tugma bosishlar:</b>\n' +
                `├ 🔍 Ism Ma'nosi: <b>${inlineStats[ActivityType.NAME_MEANING_CLICK] || 0}</b>\n` +
                `├ 🎯 Shaxsiy Tavsiya: <b>${inlineStats[ActivityType.PERSONAL_TAVSIYA_CLICK] || 0}</b>\n` +
                `├ 📜 Oferta: <b>${inlineStats[ActivityType.OFERTA_CLICK] || 0}</b>\n` +
                `├ 💳 Payme: <b>${inlineStats[ActivityType.PAYME_CLICKED] || 0}</b>\n` +
                `└ 🟢 Click: <b>${inlineStats[ActivityType.CLICK_CLICKED] || 0}</b>`;

            await ctx.reply(message, { parse_mode: 'HTML' });
        } catch (error) {
            logger.error('Activity stats error:', error);
            await ctx.reply('❌ Statistikani yuklashda xatolik!');
        }
    }

    private async sendPaymentFunnel(ctx: Context): Promise<void> {
        try {
            // All-time funnel
            const allTimeFunnel = await this.activityTracker.getPaymentFunnel();

            // Today's funnel
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const todayFunnel = await this.activityTracker.getPaymentFunnel(today, tomorrow);

            const message =
                '🔄 <b>TO\'LOV VORONKASI (Payment Funnel)</b>\n\n' +
                '<b>📊 Jami (Barcha vaqt):</b>\n' +
                `1️⃣ To'lov ekrani: <b>${allTimeFunnel.paymentScreens}</b>\n` +
                `2️⃣ Payme bosildi: <b>${allTimeFunnel.paymeClicks}</b>\n` +
                `3️⃣ Click bosildi: <b>${allTimeFunnel.clickClicks}</b>\n` +
                `4️⃣ Jami bosishlar: <b>${allTimeFunnel.totalProviderClicks}</b>\n` +
                `5️⃣ ✅ To'lovlar: <b>${allTimeFunnel.successPayments}</b>\n` +
                `6️⃣ ❌ Bekor qilindi: <b>${allTimeFunnel.failedPayments}</b>\n\n` +
                `💎 Konversiya: <b>${allTimeFunnel.conversionRate}</b>\n\n` +
                `━━━━━━━━━━━━━━━━━━━━\n\n` +
                '<b>📅 Bugun:</b>\n' +
                `1️⃣ To'lov ekrani: <b>${todayFunnel.paymentScreens}</b>\n` +
                `2️⃣ Payme: <b>${todayFunnel.paymeClicks}</b>\n` +
                `3️⃣ Click: <b>${todayFunnel.clickClicks}</b>\n` +
                `4️⃣ ✅ To'lovlar: <b>${todayFunnel.successPayments}</b>\n` +
                `💎 Konversiya: <b>${todayFunnel.conversionRate}</b>`;

            await ctx.reply(message, { parse_mode: 'HTML' });
        } catch (error) {
            logger.error('Payment funnel error:', error);
            await ctx.reply('❌ Statistikani yuklashda xatolik!');
        }
    }

    private async sendTopActiveUsers(ctx: Context): Promise<void> {
        try {
            const topUsers = await this.activityTracker.getTopActiveUsers(10);

            if (!topUsers.length) {
                await ctx.reply('📊 Hozircha faol foydalanuvchilar yo\'q.');
                return;
            }

            let message = '👥 <b>ENG FAOL FOYDALANUVCHILAR (Top 10)</b>\n\n';

            topUsers.forEach((item, index) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                const name = item.user?.firstName || 'Unknown';
                message += `${medal} <b>${name}</b>\n`;
                message += `   └ ID: <code>${item.telegramId}</code>\n`;
                message += `   └ Harakatlar: <b>${item.activityCount}</b>\n\n`;
            });

            await ctx.reply(message, { parse_mode: 'HTML' });
        } catch (error) {
            logger.error('Top active users error:', error);
            await ctx.reply('❌ Statistikani yuklashda xatolik!');
        }
    }

    private async sendDailyStats(ctx: Context): Promise<void> {
        try {
            const dailyStats = await this.activityTracker.getDailyStats(7);

            let message = '📅 <b>KUNLIK STATISTIKA (7 kun)</b>\n\n';

            for (const day of dailyStats) {
                const [dailyPayments, nameSearchBreakdown] = await Promise.all([
                    this.transactionRepository
                        .createQueryBuilder('t')
                        .where('t.status = :status', { status: TransactionStatus.PAID })
                        .andWhere(
                            '(t.performTime BETWEEN :start AND :end OR t.createdAt BETWEEN :start AND :end)',
                            { start: day.startDate, end: day.endDate },
                        )
                        .getCount(),
                    this.activityTracker.getNameSearchBreakdown(day.startDate, day.endDate),
                ]);

                message += `📆 <b>${day.dateLabel}</b>\n`;
                message += `├ /start tugmasini bosganlar: ${day.startCommands}\n`;
                message += `├ 🔍 Ism Ma'nosi tugmasini bosganlar: ${day.nameMeaningClicks}\n`;
                message += `├ 🎯 Shaxsiy Tavsiya tugmasini bosganlar: ${day.personalTavsiyaClicks}\n`;
                message += `├ 📜 Oferta tugmasini bosganlar: ${day.ofertaClicks}\n`;
                message += `├ 💳 Payme tugmasini bosganlar: ${day.paymeClicks}\n`;
                message += `└ 🟢 Click tugmasini bosganlar: ${day.clickClicks}\n`;
                message += `   🔍 Ism qidirganlar (obunali): ${nameSearchBreakdown.subscribed}\n`;
                message += `   🔍 Ism qidirganlar (obunasiz): ${nameSearchBreakdown.nonSubscribed}\n`;
                message += `   💰 To'lovlar: ${dailyPayments} ta\n\n`;
            }

            await ctx.reply(message, { parse_mode: 'HTML' });
        } catch (error) {
            logger.error('Daily stats error:', error);
            await ctx.reply('❌ Statistikani yuklashda xatolik!');
        }
    }

    private async sendChartStats(ctx: Context): Promise<void> {
        try {
            // Get last 7 days data
            const stats: { date: string; users: number; payments: number }[] = [];

            for (let i = 6; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                date.setHours(0, 0, 0, 0);

                const nextDay = new Date(date);
                nextDay.setDate(nextDay.getDate() + 1);

                const users = await this.userRepository.count({
                    where: {
                        createdAt: MoreThan(date),
                    },
                });

                const payments = await this.transactionRepository.count({
                    where: {
                        status: TransactionStatus.PAID,
                        performTime: MoreThan(date),
                    },
                });

                stats.push({
                    date: date.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit' }),
                    users,
                    payments,
                });
            }

            let message = '📈 <b>7 KUNLIK GRAFIK</b>\n\n';

            stats.forEach(day => {
                const userBar = '█'.repeat(Math.min(day.users / 5, 10));
                const paymentBar = '▓'.repeat(Math.min(day.payments / 2, 10));
                message += `${day.date}\n`;
                message += `👥 ${userBar} ${day.users}\n`;
                message += `💰 ${paymentBar} ${day.payments}\n\n`;
            });

            await ctx.reply(message, { parse_mode: 'HTML' });
        } catch (error) {
            logger.error('Chart stats error:', error);
            await ctx.reply('❌ Grafikni yuklashda xatolik!');
        }
    }

    private async grantSubscription(ctx: Context, targetTelegramId: string): Promise<void> {
        try {
            const telegramIdNum = parseInt(targetTelegramId);
            const user = await this.userRepository.findOne({
                where: { telegramId: telegramIdNum }
            });

            if (!user) {
                await ctx.reply(`❌ Telegram ID ${targetTelegramId} topilmadi!`);
                return;
            }

            const subscriptionEndDate = new Date();
            subscriptionEndDate.setFullYear(subscriptionEndDate.getFullYear() + 1);

            await this.userRepository.update(
                { id: user.id },
                {
                    isActive: true,
                    subscriptionEnd: subscriptionEndDate,
                },
            );

            logger.info('✅ Admin granted lifetime subscription', {
                adminId: ctx.from?.id,
                userId: user.id,
                userTelegramId: user.telegramId,
            });

            await ctx.reply(
                `✅ <b>Muvaffaqiyatli!</b>\n\n` +
                `Foydalanuvchi: ${user.firstName || 'Unknown'}\n` +
                `Telegram ID: ${user.telegramId}\n` +
                `Status: <b>VIP (1 yillik)</b> ♾️`,
                { parse_mode: 'HTML' }
            );

            // Notify user
            try {
                await ctx.api.sendMessage(
                    user.telegramId,
                    `🎉 <b>Tabriklaymiz!</b>\n\n` +
                    `✅ To'lov muvaffaqiyatli amalga oshirildi.\n` +
                    `🌟 Siz 1 yillik obunaga ega bo'ldingiz.\n\n` +
                    `✍️ Istalgan ismni yozing va darhol ma'nosini bilib oling.`,
                    { parse_mode: 'HTML' },
                );
            } catch (notifyError) {
                logger.error('Failed to notify user:', notifyError);
            }
        } catch (error) {
            logger.error('Grant subscription error:', error);
            await ctx.reply('❌ Obuna berishda xatolik!');
        }
    }

    private async revokeSubscription(ctx: Context, targetTelegramId: string): Promise<void> {
        try {
            const telegramIdNum = parseInt(targetTelegramId);
            const user = await this.userRepository.findOne({
                where: { telegramId: telegramIdNum }
            });

            if (!user) {
                await ctx.reply(`❌ Telegram ID ${targetTelegramId} topilmadi!`);
                return;
            }

            await this.userRepository.update(
                { id: user.id },
                {
                    isActive: false,
                    subscriptionEnd: null,
                },
            );

            logger.info('🚫 Admin revoked subscription', {
                adminId: ctx.from?.id,
                userId: user.id,
                userTelegramId: user.telegramId,
            });

            await ctx.reply(
                `✅ <b>Obuna bekor qilindi!</b>\n\n` +
                `Foydalanuvchi: ${user.firstName || 'Unknown'}\n` +
                `Telegram ID: ${user.telegramId}\n` +
                `Status: <b>Oddiy foydalanuvchi</b>`,
                { parse_mode: 'HTML' }
            );

            // Notify user
            try {
                await ctx.api.sendMessage(
                    user.telegramId,
                    `⚠️ <b>Obuna bekor qilindi</b>\n\n` +
                    `Sizning VIP obunangiz admin tomonidan bekor qilindi.\n\n` +
                    `Agar bu xato bo'lsa, admin bilan bog'laning.`,
                    { parse_mode: 'HTML' },
                );
            } catch (notifyError) {
                logger.error('Failed to notify user:', notifyError);
            }
        } catch (error) {
            logger.error('Revoke subscription error:', error);
            await ctx.reply('❌ Obunani bekor qilishda xatolik!');
        }
    }

    private async findUser(ctx: Context, query: string): Promise<void> {
        try {
            let user: UserEntity | null = null;

            // Try to find by telegram ID first
            const telegramIdNum = parseInt(query);
            if (!isNaN(telegramIdNum)) {
                user = await this.userRepository.findOne({
                    where: { telegramId: telegramIdNum }
                });
            }

            // If not found, search by name
            if (!user) {
                const users = await this.userRepository
                    .createQueryBuilder('user')
                    .where('user.firstName LIKE :query', { query: `%${query}%` })
                    .orWhere('user.lastName LIKE :query', { query: `%${query}%` })
                    .take(5)
                    .getMany();

                if (users.length === 0) {
                    await ctx.reply(`❌ "${query}" bo'yicha foydalanuvchi topilmadi!`);
                    return;
                }

                if (users.length === 1) {
                    user = users[0];
                } else {
                    let message = `🔍 <b>Topilgan foydalanuvchilar:</b>\n\n`;
                    users.forEach((u, i) => {
                        const status = u.isActive && u.subscriptionEnd && new Date(u.subscriptionEnd) > new Date()
                            ? '✅ VIP'
                            : '👤 Oddiy';
                        message += `${i + 1}. ${u.firstName || 'Unknown'} (ID: ${u.telegramId}) - ${status}\n`;
                    });
                    await ctx.reply(message, { parse_mode: 'HTML' });
                    return;
                }
            }

            if (!user) {
                await ctx.reply(`❌ Foydalanuvchi topilmadi!`);
                return;
            }

            const isActive = user.isActive && user.subscriptionEnd && new Date(user.subscriptionEnd) > new Date();
            const statusEmoji = isActive ? '✅' : '❌';
            const statusText = isActive ? 'VIP (Aktiv)' : 'Oddiy';

            let message =
                `👤 <b>FOYDALANUVCHI MA'LUMOTLARI</b>\n\n` +
                `Ism: ${user.firstName || 'Unknown'}\n` +
                `Telegram ID: <code>${user.telegramId}</code>\n` +
                `Status: ${statusEmoji} ${statusText}\n`;

            if (user.subscriptionEnd) {
                message += `Obuna tugashi: ${new Date(user.subscriptionEnd).toLocaleDateString('uz-UZ')}\n`;
            }

            message += `\n<b>Amallar:</b>\n`;
            message += `/grant ${user.telegramId} - Obuna berish\n`;
            message += `/revoke ${user.telegramId} - Obunani bekor qilish`;

            await ctx.reply(message, { parse_mode: 'HTML' });
        } catch (error) {
            logger.error('Find user error:', error);
            await ctx.reply('❌ Foydalanuvchini topishda xatolik!');
        }
    }

    private async showRequestedNames(ctx: Context): Promise<void> {
        try {
            const requestedNames = await this.requestedNameRepository.find({
                where: { isProcessed: false },
                order: { requestCount: 'DESC', createdAt: 'DESC' },
            });

            if (requestedNames.length === 0) {
                await ctx.reply('✅ Ma\'lumotlar bazasida yo\'q ismlar topilmadi!');
                return;
            }

            // 1. Jadval formatida xabar yuborish
            let message = '📋 <b>Ma\'lumotlar bazasida yo\'q ismlar</b>\n\n';
            message += `Jami: ${requestedNames.length} ta ism\n\n`;
            message += '<pre>';
            message += '┌─────┬─────────────────┬─────────┬──────────────────┬────────────┐\n';
            message += '│ №   │ Ism             │ So\'rov  │ Username         │ Sana       │\n';
            message += '├─────┼─────────────────┼─────────┼──────────────────┼────────────┤\n';

            // Faqat birinchi 20 ta ismni jadvalda ko'rsatish
            const displayItems = requestedNames.slice(0, 20);
            displayItems.forEach((item, index) => {
                const num = String(index + 1).padEnd(3);
                const name = item.name.padEnd(15).substring(0, 15);
                const count = String(item.requestCount).padEnd(7);
                const username = (item.lastRequestedByUsername || 'N/A').padEnd(16).substring(0, 16);
                const date = new Date(item.updatedAt).toLocaleDateString('uz-UZ').padEnd(10);

                message += `│ ${num} │ ${name} │ ${count} │ ${username} │ ${date} │\n`;
            });

            message += '└─────┴─────────────────┴─────────┴──────────────────┴────────────┘\n';
            message += '</pre>\n\n';

            if (requestedNames.length > 20) {
                message += `<i>Ko'rsatilgan: 20 / ${requestedNames.length}</i>\n\n`;
            }

            message += '💡 To\'liq ro\'yxatni CSV fayl ko\'rinishida yuklab olish uchun kuting...';

            await ctx.reply(message, { parse_mode: 'HTML' });

            // 2. CSV fayl yaratish va yuborish
            await this.sendRequestedNamesCSV(ctx, requestedNames);

        } catch (error) {
            logger.error('Show requested names error:', error);
            await ctx.reply('❌ Ismlarni olishda xatolik!');
        }
    }

    private async sendRequestedNamesCSV(ctx: Context, requestedNames: RequestedNameEntity[]): Promise<void> {
        try {
            // CSV kontentini yaratish
            let csvContent = 'No,Ism,Soralar_soni,Oxirgi_sorovchi,Telegram_ID,Oxirgi_sorov_sanasi,Yaratilgan_sana\n';

            requestedNames.forEach((item, index) => {
                const num = index + 1;
                const name = this.escapeCsvValue(item.name);
                const count = item.requestCount;
                const username = this.escapeCsvValue(item.lastRequestedByUsername || 'N/A');
                const telegramId = item.lastRequestedBy || 'N/A';
                const updatedDate = new Date(item.updatedAt).toISOString().split('T')[0];
                const createdDate = new Date(item.createdAt).toISOString().split('T')[0];

                csvContent += `${num},${name},${count},${username},${telegramId},${updatedDate},${createdDate}\n`;
            });

            // Fayl nomini yaratish
            const today = new Date().toISOString().split('T')[0];
            const filename = `yoq_ismlar_${today}.csv`;

            // Buffer yaratish
            const buffer = Buffer.from(csvContent, 'utf-8');

            // Faylni yuborish (Grammy API format)
            await ctx.replyWithDocument(
                new InputFile(buffer, filename),
                {
                    caption: `📊 <b>Ma'lumotlar bazasida yo'q ismlar</b>\n\nJami: ${requestedNames.length} ta ism\nSana: ${today}`,
                    parse_mode: 'HTML',
                }
            );

        } catch (error) {
            logger.error('Send CSV error:', error);
            await ctx.reply('❌ CSV faylini yuborishda xatolik!');
        }
    }

    private escapeCsvValue(value: string): string {
        // CSV uchun maxsus belgilarni escape qilish
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
    }

    private splitMessage(text: string, maxLength: number): string[] {
        const messages: string[] = [];
        const lines = text.split('\n');
        let currentMessage = '';

        for (const line of lines) {
            if ((currentMessage + line + '\n').length > maxLength) {
                if (currentMessage) {
                    messages.push(currentMessage);
                    currentMessage = '';
                }
            }
            currentMessage += line + '\n';
        }

        if (currentMessage) {
            messages.push(currentMessage);
        }

        return messages;
    }
}


// LEFT JOIN users u ON u.id = a.user_id
// WHERE a.activityType = 'name_searched'
//   AND a.createdAt BETWEEN :start AND :end

// subscribed = SUM(
//   CASE WHEN u.isActive = true
//         AND u.subscriptionEnd IS NOT NULL
//         AND u.subscriptionEnd > NOW()
//        THEN 1 ELSE 0 END
// )

// nonSubscribed = SUM(
//   CASE WHEN u.isActive = false
//         OR u.subscriptionEnd IS NULL
//         OR u.subscriptionEnd <= NOW()
//        THEN 1 ELSE 0 END
// )
