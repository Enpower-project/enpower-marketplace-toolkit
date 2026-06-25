import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Session, SessionDocument, SessionStatus } from 'src/schemas/Session.schema';
import { EmailService } from 'src/modules/email/email.service';
import { UserService } from 'src/modules/user/user.service';

/**
 * Sends email reminders for session offers lifecycle:
 * - OPEN offers: at least 48h before sessionDate (daily window approach)
 * - CLOSE offers: 24h before sessionDate (daily window approach)
 * - AUTO-CANCEL: if session is still APPROVED/PUBLISHED within 24h of sessionDate (hourly)
 *
 * To prevent duplicates, it uses:
 * - offersOpenReminderSentAt
 * - offersCloseReminderSentAt
 * - cancellationNoticeSentAt
 *
 * IMPORTANT: ensure these fields exist in Session schema (recommended),
 * otherwise use $exists filters.
 */
@Injectable()
export class SessionOfferReminderJob {
    private readonly logger = new Logger(SessionOfferReminderJob.name);

    constructor(
        @InjectModel(Session.name) private readonly sessionModel: Model<SessionDocument>,
        private readonly emailService: EmailService,
        private readonly userService: UserService,
    ) { }

    /**
   * Manual runner for local testing (e.g., from a controller or bootstrap).
   */
    async runNow(): Promise<void> {
        await this.sendOffersOpenReminders();
        await this.sendOffersCloseReminders();
        await this.autoCancelLateSessionsAndNotify();
        await this.autoCancelActiveSessionsNotClosed2hBeforeAndNotify();
    }

    /**
     * Daily cron at 09:00 server time:
     * - open reminders (48h before)
     * - close reminders (24h before)
     */
    @Cron('0 0 9 * * *')
    async handleDailyReminders(): Promise<void> {
        await this.sendOffersOpenReminders();
        await this.sendOffersCloseReminders();
    }

    @Cron('0 0 * * * *') // cada hora (minuto 0)
    async hourlyAutoCancel(): Promise<void> {
        await this.autoCancelLateSessionsAndNotify();
        await this.autoCancelActiveSessionsNotClosed2hBeforeAndNotify();
    }

    @Cron('0 0 * * *') // Every day at 00:00 (midnight)
    async handleInDeliveryTransition(): Promise<void> {
        await this.autoTransitionClosedSessionsToInDelivery();
        await this.autoTransitionInDeliverySessionsToSettlementPending();
    }

    /**
     * OPEN offers reminder: at least 48h before sessionDate.
     * Daily window: [now+48h, now+72h)
     */
    private async sendOffersOpenReminders(): Promise<void> {
        const now = new Date();
        const from = new Date(now.getTime() + 48 * 60 * 60 * 1000);
        const to = new Date(now.getTime() + 72 * 60 * 60 * 1000);

        this.logger.log(
            `Checking sessions for offers-open reminders. window=[${from.toISOString()} .. ${to.toISOString()})`,
        );

        const sessions = await this.sessionModel.find({
            sessionDate: { $gte: from, $lt: to },
            status: { $in: [SessionStatus.PUBLISHED, SessionStatus.APPROVED] },
            offersOpenReminderSentAt: null,
        }).populate('market').exec();

        if (!sessions.length) return;

        for (const session of sessions) {
            await this.processReminder(session, 'OPEN');
        }
    }

    /**
     * CLOSE offers reminder: 24h before sessionDate.
     * Daily window: [now+24h, now+48h)
     *
     * NOTE: This is a reminder email. The actual business rule "cannot close later than X"
     * should be enforced in the closeOffersPeriod() API.
     */
    private async sendOffersCloseReminders(): Promise<void> {
        const now = new Date();
        const from = new Date(now.getTime() + 12 * 60 * 60 * 1000);
        const to = new Date(now.getTime() + 36 * 60 * 60 * 1000);

        this.logger.log(
            `Checking sessions for offers-close reminders. window=[${from.toISOString()} .. ${to.toISOString()})`,
        );

        const sessions = await this.sessionModel.find({
            sessionDate: { $gte: from, $lt: to },
            status: { $in: [SessionStatus.ACTIVE] },
            offersCloseReminderSentAt: null,
        }).populate('market').exec();

        if (!sessions.length) return;

        for (const session of sessions) {
            await this.processReminder(session, 'CLOSE');
        }
    }

    /**
 * Sends either OPEN or CLOSE reminder to the market owner (FMO).
 * Marks the corresponding "sentAt" field to avoid duplicates.
 */
    private async processReminder(session: SessionDocument, kind: 'OPEN' | 'CLOSE'): Promise<void> {
        try {
            const market: any = session.market;
            const fmoUserId: string | undefined = market?.marketOwner?._id?.toString?.();

            let fmoEmail: string | undefined;

            if (fmoUserId && Types.ObjectId.isValid(fmoUserId)) {
                const fmo = await this.userService.findById(fmoUserId);
                fmoEmail = (fmo as any)?.email;
            }

            if (!fmoEmail) {
                this.logger.warn(`Skipping session ${session._id}: cannot resolve FMO email`);
                return;
            }


            const sessionDateIso = session.sessionDate?.toISOString?.() ?? '';
            const subject =
                kind === 'OPEN'
                    ? `Reminder: Open offers period for session "${session.name}"`
                    : `Reminder: Close offers period for session "${session.name}"`;

            const html =
                kind === 'OPEN'
                    ? this.generateOpenReminderTemplate(session.name, sessionDateIso)
                    : this.generateCloseReminderTemplate(session.name, sessionDateIso);

            const sent = await this.emailService.sendEmail({ to: fmoEmail, subject, html });

            if (!sent) {
                this.logger.warn(`Failed sending ${kind} reminder for session ${session._id} to ${fmoEmail}`);
                return;
            }

            if (kind === 'OPEN') {
                await this.sessionModel.updateOne(
                    { _id: session._id },
                    { $set: { offersOpenReminderSentAt: new Date() } },
                ).exec();
            } else {
                await this.sessionModel.updateOne(
                    { _id: session._id },
                    { $set: { offersCloseReminderSentAt: new Date() } },
                ).exec();
            }

            this.logger.log(`${kind} reminder sent for session ${session._id} to ${fmoEmail}`);
        } catch (err: any) {
            this.logger.error(
                `Error processing ${kind} reminder for session ${session._id}: ${err?.message}`,
                err?.stack,
            );
        }
    }

    /**
 * Auto-cancels sessions that are within the next 24 hours but still APPROVED/PUBLISHED,
 * and notifies market participants.
 *
 * WARNING: if you set cancellationNoticeSentAt before sending emails, you lose retries on failure.
 * Prefer: cancel first, send emails, then mark notice sent.
 */
    private async autoCancelLateSessionsAndNotify(): Promise<void> {
        const now = new Date();
        const to = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        this.logger.log(
            `Checking sessions for auto-cancel. window=(now=${now.toISOString()} .. ${to.toISOString()}]`,
        );

        // Sesiones dentro de las próximas 24h, aún NO canceladas, y aún NO notificadas
        const sessions = await this.sessionModel.find({
            sessionDate: { $gt: now, $lte: to },
            status: { $in: [SessionStatus.APPROVED, SessionStatus.PUBLISHED] },
            cancellationNoticeSentAt: null,
        })
            .populate('market')
            .exec();

        if (!sessions.length) return;
        const cancelReason = 'Auto-cancel: session still not active within 24h of sessionDate';
        for (const session of sessions) {
            try {
                // 1) Cancelar la sesión (y marcar que ya se notificó) de forma idempotente
                // Recomendación: hacerlo atómico para evitar doble envío si el job corre en paralelo.
                const updated = await this.sessionModel.findOneAndUpdate(
                    {
                        _id: session._id,
                        cancellationNoticeSentAt: null,
                        status: { $in: [SessionStatus.APPROVED, SessionStatus.PUBLISHED] },
                    },
                    {
                        $set: {
                            status: SessionStatus.CANCELLED,
                            cancelledAt: new Date(),
                            cancelReason: cancelReason,
                            cancellationNoticeSentAt: new Date(),
                        },
                    },
                    { new: true },
                ).exec();

                if (!updated) {
                    // ya la tocó otro worker o ya fue notificada
                    continue;
                }

                // 2) Resolver destinatarios: FMO, FRP, y todos los usuarios del market
                const market: any = session.market;

                const recipients = new Set<string>();

                // Todos los usuarios del market
                // IMPORTANTE: aquí necesitas un método en UserService para listar usuarios por market.
                // Ejemplo:
                const marketId = market?._id?.toString?.();
                const usersIds = market?.users.map(user => user.toString());
                const users = await this.userService.getUsersByIds(usersIds);

                if (marketId) {
                    for (const u of users as any[]) {
                        if (u?.email) recipients.add(u.email);
                    }
                }

                if (recipients.size === 0) {
                    this.logger.warn(`Auto-cancelled session ${session._id}, but no recipients resolved.`);
                    continue;
                }

                // 3) Enviar email
                const sessionDateIso = session.sessionDate?.toISOString?.() ?? '';
                const subject = `Session cancelled: "${session.name}"`;

                const html = this.generateCancellationTemplate(session.name, sessionDateIso, session.cancelReason ?? 'No reason provided');

                // Envío uno-a-uno para no exponer emails
                for (const email of recipients) {
                    await this.emailService.sendEmail({ to: email, subject, html });
                }

                this.logger.log(`Auto-cancel notification sent for session ${session._id} to ${recipients.size} recipients.`);
            } catch (err: any) {
                this.logger.error(
                    `Error auto-cancelling session ${session._id}: ${err?.message}`,
                    err?.stack,
                );

                // Nota: como ya hemos hecho el update atómico marcando cancellationNoticeSentAt,
                // si aquí falla el email, NO reintentará automáticamente.
                // Si quieres reintentos, te recomiendo separar:
                // - cancel + markCancelledAt
                // - email + markCancellationNoticeSentAt
                // y solo marcar sentAt después de enviar.
            }
        }
    }

    /**
 * Auto-cancels sessions that are ACTIVE but still not closed (OFFERS_CLOSED)
 * when there are 2 hours or less remaining before sessionDate (day X at 00:00).
 *
 * It sends an email notification to market participants.
 *
 * To prevent duplicates, it uses lateCloseCancellationNoticeSentAt.
 */
    private async autoCancelActiveSessionsNotClosed2hBeforeAndNotify(): Promise<void> {
        const now = new Date();
        const to = new Date(now.getTime() + 2 * 60 * 60 * 1000); // +2h

        this.logger.log(
            `Checking sessions for auto-cancel (ACTIVE but offers not closed). window=(now=${now.toISOString()} .. ${to.toISOString()}]`,
        );

        // Sessions occurring within the next 2 hours, still ACTIVE, and not yet notified
        const sessions = await this.sessionModel.find({
            sessionDate: { $gt: now, $lte: to },
            status: SessionStatus.ACTIVE,
            // if the field might not exist yet, prefer the $or with $exists
            // lateCloseCancellationNoticeSentAt: null,
            $or: [
                { lateCloseCancellationNoticeSentAt: null },
                { lateCloseCancellationNoticeSentAt: { $exists: false } },
            ],
        })
            .populate('market')
            .exec();

        if (!sessions.length) return;
        const cancelReason = 'Auto-cancel: offers period was not closed at least 2 hours before sessionDate';
        for (const session of sessions) {
            try {
                // 1) Atomically cancel the session to avoid duplicates (idempotent)
                const updated = await this.sessionModel.findOneAndUpdate(
                    {
                        _id: session._id,
                        status: SessionStatus.ACTIVE,
                        $or: [
                            { lateCloseCancellationNoticeSentAt: null },
                            { lateCloseCancellationNoticeSentAt: { $exists: false } },
                        ],
                    },
                    {
                        $set: {
                            status: SessionStatus.CANCELLED,
                            cancelledAt: new Date(),
                            cancelReason: cancelReason,
                            lateCloseCancellationNoticeSentAt: new Date(),
                        },
                    },
                    { new: true },
                ).exec();

                if (!updated) {
                    // Another worker already processed it
                    continue;
                }

                // 2) Resolve recipients (market users + optionally FMO/FRP)
                const market: any = session.market;
                const recipients = new Set<string>();

                // Example: you are using market.users -> ensure it exists & is correct.
                // Prefer: userService.getUsersByMarket(marketId) in real production.
                const usersIds = market?.users?.map((u: any) => u.toString()) ?? [];
                const users = usersIds.length ? await this.userService.getUsersByIds(usersIds) : [];

                for (const u of users as any[]) {
                    if (u?.email) recipients.add(u.email);
                }

                // OPTIONAL: if your market has marketOwner / frp references and you want them explicitly:
                // const fmoId = market?.marketOwner?._id?.toString?.();
                // if (fmoId) { const fmo = await this.userService.findById(fmoId); if ((fmo as any)?.email) recipients.add((fmo as any).email); }
                // const frpId = market?.frp?._id?.toString?.(); // adapt to your schema
                // if (frpId) { const frp = await this.userService.findById(frpId); if ((frp as any)?.email) recipients.add((frp as any).email); }

                if (recipients.size === 0) {
                    this.logger.warn(`Auto-cancelled session ${session._id}, but no recipients resolved.`);
                    continue;
                }

                // 3) Send email
                const sessionDateIso = session.sessionDate?.toISOString?.() ?? '';
                const subject = `Session cancelled (offers not closed): "${session.name}"`;

                const html = this.generateCancellationTemplate(session.name, sessionDateIso, cancelReason ?? 'No reason provided');

                // Send one-by-one to avoid exposing emails
                for (const email of recipients) {
                    await this.emailService.sendEmail({ to: email, subject, html });
                }

                this.logger.log(
                    `Auto-cancel (offers not closed) notification sent for session ${session._id} to ${recipients.size} recipients.`,
                );
            } catch (err: any) {
                this.logger.error(
                    `Error auto-cancelling (offers not closed) session ${session._id}: ${err?.message}`,
                    err?.stack,
                );

                // Same note as before: since we set lateCloseCancellationNoticeSentAt in the atomic update,
                // if emails fail, it won't retry. If you need retries, split "cancel" and "notice sent".
            }
        }
    }

    private async autoTransitionClosedSessionsToInDelivery(): Promise<void> {
        const now = new Date();

        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        // Only run at midnight (00:00)
        if (currentHour !== 0 || currentMinute !== 0) {
            return;
        }

        this.logger.log(
            `Checking sessions for auto-transition to IN_DELIVERY (current  time: ${now.toISOString()})`,
        );

        const today = new Date(now);
        today.setHours(0, 0, 0, 0);

        const endOfToday = new Date(today);
        endOfToday.setHours(23, 59, 59, 999);

        const sessions = await this.sessionModel.find({
            sessionDate: { $gte: today, $lte: endOfToday },
            status: SessionStatus.OFFERS_CLOSED,
        })
            .populate('market')
            .exec();

        if (!sessions.length) {
            this.logger.log('No sessions found for IN_DELIVERY transition.');
            return;
        }

        for (const session of sessions) {
            try {
                // Atomically update to IN_DELIVERY to avoid race conditions
                const updated = await this.sessionModel.findOneAndUpdate(
                    {
                        _id: session._id,
                        status: SessionStatus.OFFERS_CLOSED,
                    },
                    {
                        $set: {
                            status: SessionStatus.IN_DELIVERY,
                        },
                    },
                    { new: true },
                ).exec();

                if (!updated) {
                    // Another worker already processed it
                    continue;
                }

                this.logger.log(
                    `Session ${session._id} ("${session.name}") transitioned to IN_DELIVERY for sessionDate ${session.sessionDate?.toISOString()}`,
                );

            } catch (err: any) {
                this.logger.error(
                    `Error transitioning session ${session._id} to IN_DELIVERY: ${err?.message}`,
                    err?.stack,
                );
            }
        }
    }

    private async autoTransitionInDeliverySessionsToSettlementPending(): Promise<void> {
        const now = new Date();

        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        // Only run at midnight (00:00)
        if (currentHour !== 0 || currentMinute !== 0) {
            return;
        }

        this.logger.log(
            `Checking sessions for auto-transition to SETTLEMENT_PENDING (current  time: ${now.toISOString()})`,
        );

        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);

        const endOfYesterday = new Date(yesterday);
        endOfYesterday.setHours(23, 59, 59, 999);

        const sessions = await this.sessionModel.find({
            sessionDate: { $gte: yesterday, $lte: endOfYesterday },
            status: SessionStatus.IN_DELIVERY,
        })
            .populate('market')
            .exec();

        if (!sessions.length) {
            this.logger.log('No sessions found for SETTLEMENT_PENDING transition.');
            return;
        }

        for (const session of sessions) {
            try {
                // Atomically update to IN_DELIVERY to avoid race conditions
                const updated = await this.sessionModel.findOneAndUpdate(
                    {
                        _id: session._id,
                        status: SessionStatus.IN_DELIVERY,
                    },
                    {
                        $set: {
                            status: SessionStatus.SETTLEMENT_PENDING,
                        },
                    },
                    { new: true },
                ).exec();

                if (!updated) {
                    // Another worker already processed it
                    continue;
                }

                this.logger.log(
                    `Session ${session._id} ("${session.name}") transitioned to SETTLEMENT_PENDING for sessionDate ${session.sessionDate?.toISOString()}`,
                );

            } catch (err: any) {
                this.logger.error(
                    `Error transitioning session ${session._id} to SETTLEMENT_PENDING: ${err?.message}`,
                    err?.stack,
                );
            }
        }
    }

    private generateOpenReminderTemplate(sessionName: string, sessionDate: string): string {
        return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Open Offers Period Reminder</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .info-box { background-color: #e8f4f8; padding: 15px; border-left: 4px solid #4CAF50; margin: 20px 0; }
        .button { display: inline-block; background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔋 Energy Marketplace</h1>
          <h2>⏰ Session Reminder</h2>
        </div>
        
        <div class="content">
          <p>Hello,</p>
          
          <p>This is a reminder to <strong style="color: #4CAF50;">open the offers period</strong> for the upcoming session.</p>
          
          <div class="info-box">
            <p><strong>📋 Session:</strong> ${sessionName}</p>
            <p><strong>📅 Date:</strong> ${new Date(sessionDate).toLocaleString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })}</p>
          </div>
          
          <p>Please open the offers period in the platform to allow participants to submit their offers.</p>
          
          <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
        </div>
        
        <div class="footer">
          <p>Best regards,</p>
          <p><strong>Energy Marketplace Team</strong></p>
        </div>
      </div>
    </body>
    </html>
    `;
    }

    private generateCloseReminderTemplate(sessionName: string, sessionDate: string): string {
        return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Close Offers Period Reminder</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #FF9800; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .info-box { background-color: #fff3cd; padding: 15px; border-left: 4px solid #FF9800; margin: 20px 0; }
        .button { display: inline-block; background-color: #FF9800; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0; }
        .warning { background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; border-radius: 4px; margin: 15px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔋 Energy Marketplace</h1>
          <h2>⚠️ Urgent Session Reminder</h2>
        </div>
        
        <div class="content">
          <p>Hello,</p>
          
          <p>This is an <strong>urgent reminder</strong> to <strong style="color: #FF9800;">close the offers period</strong> before the session day.</p>
          
          <div class="info-box">
            <p><strong>📋 Session:</strong> ${sessionName}</p>
            <p><strong>📅 Date:</strong> ${new Date(sessionDate).toLocaleString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })}</p>
          </div>
          
          <div class="warning">
            <p><strong>⚠️ Important:</strong> Please ensure the offers period is closed before the session begins to allow proper processing of all submitted offers.</p>
          </div>
          
          <p>Please close the offers period in the platform as soon as possible.</p>
          
          <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
        </div>
        
        <div class="footer">
          <p>Best regards,</p>
          <p><strong>Energy Marketplace Team</strong></p>
        </div>
      </div>
    </body>
    </html>
    `;
    }

    private generateCancellationTemplate(sessionName: string, sessionDate: string, reason: string): string {
        return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Session Cancelled</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #f44336; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .info-box { background-color: #ffebee; padding: 15px; border-left: 4px solid #f44336; margin: 20px 0; }
        .warning { background-color: #ffebee; border: 1px solid #ef9a9a; padding: 10px; border-radius: 4px; margin: 15px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔋 Energy Marketplace</h1>
          <h2>❌ Session Cancelled</h2>
        </div>
        
        <div class="content">
          <p>Hello,</p>
          
          <p>This is an automated notification: the session has been <strong style="color: #f44336;">cancelled</strong>.</p>
          
          <div class="info-box">
            <p><strong>📋 Session:</strong> ${sessionName}</p>
            <p><strong>📅 Scheduled Date:</strong> ${new Date(sessionDate).toLocaleString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })}</p>
          </div>
          
          <div class="warning">
            <p><strong>📌 Reason: ${reason}</p>
          </div>
          
          <p>The offers period was not opened in time, so the session has been automatically cancelled to maintain platform integrity.</p>
          
          <p>If you have any questions or need further details, please contact the market operator.</p>
        </div>
        
        <div class="footer">
          <p>Best regards,</p>
          <p><strong>Energy Marketplace Team</strong></p>
        </div>
      </div>
    </body>
    </html>
    `;
    }
}