import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

export interface EmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  from?: string;
}

export interface MarketOwnerWelcomeData {
  email: string;
  username: string;
  temporaryPassword: string;
  marketName?: string;
  language?: string;
}

export interface MarketAcceptanceData {
  email: string;
  username: string;
  marketName: string;
  marketId: string;
  acceptanceToken?: string; // Made optional since we're removing token system
  temporaryPassword?: string; // Only for new users
  language?: string;
}

export interface WalletPinNotificationData {
  email: string;
  username: string;
  pin: string;
  walletType: 'SELF' | 'MARKET';
  marketName?: string; // Only for MARKET wallet type
  language?: string;
}

export interface UserInvitationData {
  email: string;
  inviterName: string;
  marketName: string;
  role: string;
  invitationLink: string;
  expiresAt: Date;
  language?: string;
}

export interface FrpPaymentRequestData {
  email: string;
  username: string;
  sessionName: string;
  sessionAddress: string;
  marketName: string;
  deliveryDate: Date;
  totalSettlements: number;
  amountRequired: string; // Formatted amount (e.g., "125.5000 FLEX")
  depositLink: string;
  language?: string;
}

@Injectable()
export class EmailService implements OnModuleInit {
  private transporter: Transporter;
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly i18n: I18nService,
  ) {
    this.logger.log('EmailService constructor called');
  }

  onModuleInit() {
    this.logger.log('EmailService onModuleInit called');
    this.createTransporter();
  }

  private createTransporter() {
    this.logger.log('Creating email transporter...');

    const smtpHost = this.configService.get<string>('SMTP_HOST');
    const smtpPort = parseInt(this.configService.get<string>('SMTP_PORT') || '1025');
    const smtpSecure = this.configService.get<string>('SMTP_SECURE') === 'true';
    const smtpAuth = this.configService.get<string>('SMTP_AUTH') === 'true';

    this.logger.log(`SMTP Config - Host: ${smtpHost}, Port: ${smtpPort}, Secure: ${smtpSecure}, Auth: ${smtpAuth}`);

    const emailConfig: any = {
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      requireTLS: false,
      ignoreTLS: true,
    };

    if (smtpAuth) {
      const smtpUser = this.configService.get<string>('SMTP_USER');
      const smtpPassword = this.configService.get<string>('SMTP_PASSWORD');
      this.logger.log(`Adding SMTP auth - User: ${smtpUser}`);

      emailConfig.auth = {
        user: smtpUser,
        pass: smtpPassword,
      };
    } else {
      this.logger.log('SMTP auth disabled - no authentication will be used');
    }

    this.logger.log('Final email configuration:', JSON.stringify(emailConfig, null, 2));

    this.transporter = nodemailer.createTransport(emailConfig);

    this.transporter.verify((error, success) => {
      if (error) {
        this.logger.error('Email configuration error:', error);
      } else {
        this.logger.log('Email service is ready to send messages');
      }
    });
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      const mailOptions = {
        from: options.from || this.configService.get<string>('SMTP_FROM_EMAIL'),
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      };

      const result = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Email sent successfully to ${options.to}. MessageId: ${result.messageId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${options.to}:`, error);
      return false;
    }
  }

  async sendMarketOwnerWelcomeEmail(data: MarketOwnerWelcomeData): Promise<boolean> {
    const { email, username, temporaryPassword, marketName, language = 'en' } = data;

    const subject = await this.i18n.translate('email.marketOwnerWelcome.subject', { lang: language });
    const html = await this.generateMarketOwnerWelcomeTemplate(username, temporaryPassword, marketName, language);
    const text = await this.generateMarketOwnerWelcomeText(username, temporaryPassword, marketName, language);

    return this.sendEmail({
      to: email,
      subject,
      html,
      text,
    });
  }

  private async generateMarketOwnerWelcomeTemplate(
    username: string,
    temporaryPassword: string,
    marketName?: string,
    language: string = 'en'
  ): Promise<string> {
    const loginUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:4200';

    // Get translations
    const greeting = await this.i18n.translate('email.marketOwnerWelcome.greeting', { lang: language });
    const credentials = await this.i18n.translate('email.marketOwnerWelcome.credentials', { lang: language });
    const usernameLabel = await this.i18n.translate('email.marketOwnerWelcome.username', { lang: language });
    const temporaryPasswordLabel = await this.i18n.translate('email.marketOwnerWelcome.temporaryPassword', { lang: language });
    const marketLabel = await this.i18n.translate('email.marketOwnerWelcome.market', { lang: language });
    const loginInstructions = await this.i18n.translate('email.marketOwnerWelcome.loginInstructions', { lang: language });
    const support = await this.i18n.translate('email.marketOwnerWelcome.support', { lang: language });
    const regards = await this.i18n.translate('email.marketOwnerWelcome.regards', { lang: language });
    const team = await this.i18n.translate('email.marketOwnerWelcome.team', { lang: language });

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${greeting}</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2c5aa0; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .credentials { background-color: #e8f4f8; padding: 15px; border-left: 4px solid #2c5aa0; margin: 20px 0; }
        .button { display: inline-block; background-color: #2c5aa0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0; }
        .warning { background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; border-radius: 4px; margin: 15px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔋 Energy Marketplace</h1>
          <h2>${greeting}</h2>
        </div>
        
        <div class="content">
          <p><strong>${username}</strong>,</p>
          
          <p>${marketName ? `${marketLabel}: "<strong>${marketName}</strong>"` : marketLabel}</p>
          
          <div class="credentials">
            <h3>🔑 ${credentials}</h3>
            <p><strong>${usernameLabel}:</strong> ${username}</p>
            <p><strong>${temporaryPasswordLabel}:</strong> <code>${temporaryPassword}</code></p>
            <p><strong>URL:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
          </div>
          
          <p>${loginInstructions}</p>
          
          <div style="text-align: center;">
            <a href="${loginUrl}" class="button">Login</a>
          </div>
          
          <p>${support}</p>
        </div>
        
        <div class="footer">
          <p>${regards}</p>
          <p>${team}</p>
        </div>
      </div>
    </body>
    </html>
    `;
  }

  private async generateMarketOwnerWelcomeText(
    username: string,
    temporaryPassword: string,
    marketName?: string,
    language: string = 'en'
  ): Promise<string> {
    const loginUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:4200';

    const greeting = await this.i18n.translate('email.marketOwnerWelcome.greeting', { lang: language });
    const credentials = await this.i18n.translate('email.marketOwnerWelcome.credentials', { lang: language });
    const usernameLabel = await this.i18n.translate('email.marketOwnerWelcome.username', { lang: language });
    const temporaryPasswordLabel = await this.i18n.translate('email.marketOwnerWelcome.temporaryPassword', { lang: language });
    const marketLabel = await this.i18n.translate('email.marketOwnerWelcome.market', { lang: language });
    const loginInstructions = await this.i18n.translate('email.marketOwnerWelcome.loginInstructions', { lang: language });
    const support = await this.i18n.translate('email.marketOwnerWelcome.support', { lang: language });
    const regards = await this.i18n.translate('email.marketOwnerWelcome.regards', { lang: language });
    const team = await this.i18n.translate('email.marketOwnerWelcome.team', { lang: language });

    return `
${greeting}

${username},

${marketName ? `${marketLabel}: "${marketName}"` : marketLabel}

${credentials}:
${usernameLabel}: ${username}
${temporaryPasswordLabel}: ${temporaryPassword}
URL: ${loginUrl}

${loginInstructions}

${support}

${regards}
${team}
    `;
  }

  async sendPasswordResetEmail(email: string, resetToken: string, language: string = 'en'): Promise<boolean> {
    const subject = await this.i18n.translate('email.passwordReset.subject', { lang: language });
    const greeting = await this.i18n.translate('email.passwordReset.greeting', { lang: language });
    const instructions = await this.i18n.translate('email.passwordReset.instructions', { lang: language });
    const resetLink = await this.i18n.translate('email.passwordReset.resetLink', { lang: language });
    const expiration = await this.i18n.translate('email.passwordReset.expiration', { lang: language });
    const noRequest = await this.i18n.translate('email.passwordReset.noRequest', { lang: language });
    const regards = await this.i18n.translate('email.passwordReset.regards', { lang: language });
    const team = await this.i18n.translate('email.passwordReset.team', { lang: language });

    const resetUrl = `${this.configService.get<string>('FRONTEND_URL')}/reset-password?token=${resetToken}`;

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${subject}</title>
    </head>
    <body>
      <h2>${subject}</h2>
      <p>${greeting}</p>
      <p>${instructions}</p>
      <p><a href="${resetUrl}">${resetLink}</a></p>
      <p>${expiration}</p>
      <p>${noRequest}</p>
      <p>${regards}<br>${team}</p>
    </body>
    </html>
    `;

    const text = `
${subject}

${greeting}

${instructions}

${resetUrl}

${expiration}

${noRequest}

${regards}
${team}
    `;

    return this.sendEmail({
      to: email,
      subject,
      html,
      text,
    });
  }

  async sendMarketActivationNotification(ownerEmail: string, marketName: string, language: string = 'en'): Promise<boolean> {
    const subject = await this.i18n.translate('email.marketActivation.subject', { lang: language });
    const greeting = await this.i18n.translate('email.marketActivation.greeting', { lang: language });
    const message = await this.i18n.translate('email.marketActivation.message', { lang: language });
    const marketNameLabel = await this.i18n.translate('email.marketActivation.marketName', { lang: language });
    const instructions = await this.i18n.translate('email.marketActivation.instructions', { lang: language });
    const regards = await this.i18n.translate('email.marketActivation.regards', { lang: language });
    const team = await this.i18n.translate('email.marketActivation.team', { lang: language });

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${subject}</title>
    </head>
    <body>
      <h2>${subject}</h2>
      <p>${greeting}</p>
      <p>${message}</p>
      <p><strong>${marketNameLabel}:</strong> ${marketName}</p>
      <p>${instructions}</p>
      <p>${regards}<br>${team}</p>
    </body>
    </html>
    `;

    const text = `
${subject}

${greeting}

${message}

${marketNameLabel}: ${marketName}

${instructions}

${regards}
${team}
    `;

    return this.sendEmail({
      to: ownerEmail,
      subject,
      html,
      text,
    });
  }

  async sendMarketAcceptanceEmail(data: MarketAcceptanceData): Promise<boolean> {
    const { email, username, marketName, marketId, acceptanceToken, temporaryPassword, language = 'en' } = data;

    const subject = await this.i18n.translate('email.marketAcceptance.subject', { lang: language });
    const html = await this.generateMarketAcceptanceTemplate(
      username, 
      marketName, 
      marketId, 
      acceptanceToken, 
      temporaryPassword, 
      language
    );
    const text = await this.generateMarketAcceptanceText(
      username, 
      marketName, 
      marketId, 
      acceptanceToken, 
      temporaryPassword, 
      language
    );

    return this.sendEmail({
      to: email,
      subject,
      html,
      text,
    });
  }

  private async generateMarketAcceptanceTemplate(
    username: string,
    marketName: string,
    marketId: string,
    acceptanceToken?: string,
    temporaryPassword?: string,
    language: string = 'en'
  ): Promise<string> {
    const loginUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:4200';
    const acceptanceUrl = `${loginUrl}/accept-market?token=${acceptanceToken}&marketId=${marketId}`;

    const greeting = await this.i18n.translate('email.marketAcceptance.greeting', { lang: language });
    const message = await this.i18n.translate('email.marketAcceptance.message', { lang: language });
    const marketLabel = await this.i18n.translate('email.marketAcceptance.market', { lang: language });
    const acceptanceInstructions = await this.i18n.translate('email.marketAcceptance.acceptanceInstructions', { lang: language });
    const buttonText = await this.i18n.translate('email.marketAcceptance.acceptButton', { lang: language });
    const credentials = temporaryPassword ? await this.i18n.translate('email.marketAcceptance.credentials', { lang: language }) : '';
    const usernameLabel = temporaryPassword ? await this.i18n.translate('email.marketAcceptance.username', { lang: language }) : '';
    const temporaryPasswordLabel = temporaryPassword ? await this.i18n.translate('email.marketAcceptance.temporaryPassword', { lang: language }) : '';
    const support = await this.i18n.translate('email.marketAcceptance.support', { lang: language });
    const regards = await this.i18n.translate('email.marketAcceptance.regards', { lang: language });
    const team = await this.i18n.translate('email.marketAcceptance.team', { lang: language });

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${greeting}</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2c5aa0; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .credentials { background-color: #e8f4f8; padding: 15px; border-left: 4px solid #2c5aa0; margin: 20px 0; }
        .button { display: inline-block; background-color: #2c5aa0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0; }
        .warning { background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; border-radius: 4px; margin: 15px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔋 Energy Marketplace</h1>
          <h2>${greeting}</h2>
        </div>
        
        <div class="content">
          <p><strong>Hi ${username}</strong></p>
          
          <p>${message}</p>
          <p>${marketLabel}: \"<strong>${marketName}</strong>\"</p>
          
          ${temporaryPassword ? `
          <div class="credentials">
            <h3>🔑 ${credentials}</h3>
            <p><strong>${usernameLabel}:</strong> ${username}</p>
            <p><strong>${temporaryPasswordLabel}:</strong> <code>${temporaryPassword}</code></p>
          </div>
          ` : ''}
          
          <p>${acceptanceInstructions}</p>
          
          <div style="text-align: center;">
            <a href="${acceptanceUrl}" class="button">${buttonText}</a>
          </div>
          
          <p>${support}</p>
        </div>
        
        <div class="footer">
          <p>${regards}</p>
          <p>${team}</p>
        </div>
      </div>
    </body>
    </html>
    `;
  }

  private async generateMarketAcceptanceText(
    username: string,
    marketName: string,
    marketId: string,
    acceptanceToken?: string,
    temporaryPassword?: string,
    language: string = 'en'
  ): Promise<string> {
    const loginUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:4200';
    const acceptanceUrl = `${loginUrl}/accept-market?token=${acceptanceToken}&marketId=${marketId}`;

    const greeting = await this.i18n.translate('email.marketAcceptance.greeting', { lang: language });
    const message = await this.i18n.translate('email.marketAcceptance.message', { lang: language });
    const marketLabel = await this.i18n.translate('email.marketAcceptance.market', { lang: language });
    const acceptanceInstructions = await this.i18n.translate('email.marketAcceptance.acceptanceInstructions', { lang: language });
    const credentials = temporaryPassword ? await this.i18n.translate('email.marketAcceptance.credentials', { lang: language }) : '';
    const usernameLabel = temporaryPassword ? await this.i18n.translate('email.marketAcceptance.username', { lang: language }) : '';
    const temporaryPasswordLabel = temporaryPassword ? await this.i18n.translate('email.marketAcceptance.temporaryPassword', { lang: language }) : '';
    const support = await this.i18n.translate('email.marketAcceptance.support', { lang: language });
    const regards = await this.i18n.translate('email.marketAcceptance.regards', { lang: language });
    const team = await this.i18n.translate('email.marketAcceptance.team', { lang: language });

    return `
${greeting}

${username},

${message}
${marketLabel}: "${marketName}"

${temporaryPassword ? `
${credentials}:
${usernameLabel}: ${username}
${temporaryPasswordLabel}: ${temporaryPassword}
` : ''}

${acceptanceInstructions}

${acceptanceUrl}

${support}

${regards}
${team}
    `;
  }

  async sendWalletPinNotification(data: WalletPinNotificationData): Promise<boolean> {
    const { email, username, pin, walletType, marketName, language = 'en' } = data;

    const subject = walletType === 'SELF' 
      ? await this.i18n.translate('email.walletPin.selfSubject', { lang: language })
      : await this.i18n.translate('email.walletPin.marketSubject', { lang: language });

    const html = await this.generateWalletPinTemplate(username, pin, walletType, marketName, language);
    const text = await this.generateWalletPinText(username, pin, walletType, marketName, language);

    return this.sendEmail({
      to: email,
      subject,
      html,
      text,
    });
  }

  private async generateWalletPinTemplate(
    username: string,
    pin: string,
    walletType: 'SELF' | 'MARKET',
    marketName?: string,
    language: string = 'en'
  ): Promise<string> {
    const loginUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:4200';

    const greeting = await this.i18n.translate('email.walletPin.greeting', { lang: language });
    const message = walletType === 'SELF'
      ? await this.i18n.translate('email.walletPin.selfMessage', { lang: language })
      : await this.i18n.translate('email.walletPin.marketMessage', { lang: language });
    const marketLabel = await this.i18n.translate('email.walletPin.market', { lang: language });
    const pinLabel = await this.i18n.translate('email.walletPin.pin', { lang: language });
    const securityWarning = await this.i18n.translate('email.walletPin.securityWarning', { lang: language });
    const instructions = await this.i18n.translate('email.walletPin.instructions', { lang: language });
    const support = await this.i18n.translate('email.walletPin.support', { lang: language });
    const regards = await this.i18n.translate('email.walletPin.regards', { lang: language });
    const team = await this.i18n.translate('email.walletPin.team', { lang: language });

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${greeting}</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2c5aa0; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .pin-box { background-color: #e8f4f8; padding: 20px; border-left: 4px solid #2c5aa0; margin: 20px 0; text-align: center; }
        .pin-code { font-size: 24px; font-weight: bold; color: #2c5aa0; letter-spacing: 2px; background-color: white; padding: 15px; border-radius: 4px; }
        .warning { background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 4px; margin: 20px 0; }
        .button { display: inline-block; background-color: #2c5aa0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔋 Energy Marketplace</h1>
          <h2>🔐 ${greeting}</h2>
        </div>
        
        <div class="content">
          <p><strong>${username}</strong>,</p>
          
          <p>${message}</p>
          ${marketName ? `<p><strong>${marketLabel}:</strong> ${marketName}</p>` : ''}
          
          <div class="pin-box">
            <h3>🔑 ${pinLabel}</h3>
            <div class="pin-code">${pin}</div>
          </div>
          
          <div class="warning">
            <p><strong>⚠️ ${securityWarning}</strong></p>
          </div>
          
          <p>${instructions}</p>
          
          <div style="text-align: center;">
            <a href="${loginUrl}" class="button">Access Portal</a>
          </div>
          
          <p>${support}</p>
        </div>
        
        <div class="footer">
          <p>${regards}</p>
          <p>${team}</p>
        </div>
      </div>
    </body>
    </html>
    `;
  }

  private async generateWalletPinText(
    username: string,
    pin: string,
    walletType: 'SELF' | 'MARKET',
    marketName?: string,
    language: string = 'en'
  ): Promise<string> {
    const loginUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:4200';

    const greeting = await this.i18n.translate('email.walletPin.greeting', { lang: language });
    const message = walletType === 'SELF'
      ? await this.i18n.translate('email.walletPin.selfMessage', { lang: language })
      : await this.i18n.translate('email.walletPin.marketMessage', { lang: language });
    const marketLabel = await this.i18n.translate('email.walletPin.market', { lang: language });
    const pinLabel = await this.i18n.translate('email.walletPin.pin', { lang: language });
    const securityWarning = await this.i18n.translate('email.walletPin.securityWarning', { lang: language });
    const instructions = await this.i18n.translate('email.walletPin.instructions', { lang: language });
    const support = await this.i18n.translate('email.walletPin.support', { lang: language });
    const regards = await this.i18n.translate('email.walletPin.regards', { lang: language });
    const team = await this.i18n.translate('email.walletPin.team', { lang: language });

    return `
🔐 ${greeting}

${username},

${message}
${marketName ? `${marketLabel}: ${marketName}` : ''}

🔑 ${pinLabel}: ${pin}

⚠️ ${securityWarning}

${instructions}

Portal: ${loginUrl}

${support}

${regards}
${team}
    `;
  }

  /**
   * Send user invitation email
   */
  async sendUserInvitation(data: UserInvitationData): Promise<boolean> {
    const { email, inviterName, marketName, role, invitationLink, expiresAt, language = 'en' } = data;

    let subject = await this.i18n.translate('email.invitation.subject', { lang: language });
    // Manual interpolation for marketName in subject
    subject = subject.replace(/\{\{marketName\}\}/g, marketName);

    const html = await this.generateInvitationTemplate(
      inviterName,
      marketName,
      role,
      invitationLink,
      expiresAt,
      language
    );

    const text = await this.generateInvitationText(
      inviterName,
      marketName,
      role,
      invitationLink,
      expiresAt,
      language
    );

    return this.sendEmail({
      to: email,
      subject,
      html,
      text,
    });
  }

  private async generateInvitationTemplate(
    inviterName: string,
    marketName: string,
    role: string,
    invitationLink: string,
    expiresAt: Date,
    language: string = 'en'
  ): Promise<string> {
    const greeting = await this.i18n.translate('email.invitation.greeting', { lang: language });
    let message = await this.i18n.translate('email.invitation.message', { lang: language });
    // Manual interpolation for variables
    message = message
      .replace(/\{\{inviterName\}\}/g, inviterName)
      .replace(/\{\{marketName\}\}/g, marketName)
      .replace(/\{\{role\}\}/g, role);
    const instructions = await this.i18n.translate('email.invitation.instructions', { lang: language });
    const expiryLabel = await this.i18n.translate('email.invitation.expiryLabel', { lang: language });
    const buttonText = await this.i18n.translate('email.invitation.buttonText', { lang: language });
    const regards = await this.i18n.translate('email.common.regards', { lang: language });
    const team = await this.i18n.translate('email.common.team', { lang: language });

    const expiryDate = expiresAt.toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
          .button { display: inline-block; padding: 12px 30px; background-color: #4CAF50; color: white !important; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .info-box { background-color: #e8f5e9; border-left: 4px solid #4CAF50; padding: 15px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>${greeting}</h2>
          </div>
          <div class="content">
            <p>${message}</p>
            <p>${instructions}</p>

            <div style="text-align: center;">
              <a href="${invitationLink}" class="button">${buttonText}</a>
            </div>

            <div class="info-box">
              <p><strong>${expiryLabel}:</strong> ${expiryDate}</p>
            </div>

            <p>${regards}</p>
            <p><strong>${team}</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private async generateInvitationText(
    inviterName: string,
    marketName: string,
    role: string,
    invitationLink: string,
    expiresAt: Date,
    language: string = 'en'
  ): Promise<string> {
    const greeting = await this.i18n.translate('email.invitation.greeting', { lang: language });
    let message = await this.i18n.translate('email.invitation.message', { lang: language });
    // Manual interpolation for variables
    message = message
      .replace(/\{\{inviterName\}\}/g, inviterName)
      .replace(/\{\{marketName\}\}/g, marketName)
      .replace(/\{\{role\}\}/g, role);
    const instructions = await this.i18n.translate('email.invitation.instructions', { lang: language });
    const expiryLabel = await this.i18n.translate('email.invitation.expiryLabel', { lang: language });
    const regards = await this.i18n.translate('email.common.regards', { lang: language });
    const team = await this.i18n.translate('email.common.team', { lang: language });

    const expiryDate = expiresAt.toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    return `
${greeting}

${message}

${instructions}

${invitationLink}

${expiryLabel}: ${expiryDate}

${regards}
${team}
    `;
  }

  /**
   * Send FRP payment request notification email
   */
  async sendFrpPaymentRequestEmail(data: FrpPaymentRequestData): Promise<boolean> {
    const {
      email,
      username,
      sessionName,
      sessionAddress,
      marketName,
      deliveryDate,
      totalSettlements,
      amountRequired,
      depositLink,
      language = 'en',
    } = data;

    const subject = await this.i18n.translate('email.frpPaymentRequest.subject', { lang: language });
    const html = await this.generateFrpPaymentRequestTemplate(
      username,
      sessionName,
      sessionAddress,
      marketName,
      deliveryDate,
      totalSettlements,
      amountRequired,
      depositLink,
      language,
    );
    const text = await this.generateFrpPaymentRequestText(
      username,
      sessionName,
      sessionAddress,
      marketName,
      deliveryDate,
      totalSettlements,
      amountRequired,
      depositLink,
      language,
    );

    return this.sendEmail({
      to: email,
      subject,
      html,
      text,
    });
  }

  private async generateFrpPaymentRequestTemplate(
    username: string,
    sessionName: string,
    sessionAddress: string,
    marketName: string,
    deliveryDate: Date,
    totalSettlements: number,
    amountRequired: string,
    depositLink: string,
    language: string = 'en',
  ): Promise<string> {
    const greeting = await this.i18n.translate('email.frpPaymentRequest.greeting', { lang: language });
    const message = await this.i18n.translate('email.frpPaymentRequest.message', { lang: language });
    const sessionLabel = await this.i18n.translate('email.frpPaymentRequest.sessionLabel', { lang: language });
    const marketLabel = await this.i18n.translate('email.frpPaymentRequest.marketLabel', { lang: language });
    const deliveryDateLabel = await this.i18n.translate('email.frpPaymentRequest.deliveryDateLabel', { lang: language });
    const totalSettlementsLabel = await this.i18n.translate('email.frpPaymentRequest.totalSettlementsLabel', { lang: language });
    const amountRequiredLabel = await this.i18n.translate('email.frpPaymentRequest.amountRequiredLabel', { lang: language });
    const instructions = await this.i18n.translate('email.frpPaymentRequest.instructions', { lang: language });
    const deadline = await this.i18n.translate('email.frpPaymentRequest.deadline', { lang: language });
    const buttonText = await this.i18n.translate('email.frpPaymentRequest.buttonText', { lang: language });
    const support = await this.i18n.translate('email.frpPaymentRequest.support', { lang: language });
    const regards = await this.i18n.translate('email.frpPaymentRequest.regards', { lang: language });
    const team = await this.i18n.translate('email.frpPaymentRequest.team', { lang: language });

    const formattedDeliveryDate = deliveryDate.toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const shortAddress = `${sessionAddress.slice(0, 10)}...${sessionAddress.slice(-8)}`;

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${greeting}</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #ff9800; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { padding: 20px; background-color: #f9f9f9; border-radius: 0 0 5px 5px; }
        .info-box { background-color: #fff3e0; border-left: 4px solid #ff9800; padding: 15px; margin: 20px 0; }
        .amount-box { background-color: #e8f5e9; border: 2px solid #4CAF50; padding: 20px; margin: 20px 0; text-align: center; border-radius: 5px; }
        .amount { font-size: 28px; font-weight: bold; color: #2e7d32; }
        .button { display: inline-block; background-color: #4CAF50; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-size: 16px; font-weight: bold; }
        .warning { background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 4px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
        .detail-label { color: #666; }
        .detail-value { font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>💰 ${greeting}</h1>
        </div>

        <div class="content">
          <p><strong>${username}</strong>,</p>

          <p>${message}</p>

          <div class="info-box">
            <div class="detail-row">
              <span class="detail-label">${sessionLabel}:</span>
              <span class="detail-value">${sessionName}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Contract:</span>
              <span class="detail-value">${shortAddress}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">${marketLabel}:</span>
              <span class="detail-value">${marketName}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">${deliveryDateLabel}:</span>
              <span class="detail-value">${formattedDeliveryDate}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">${totalSettlementsLabel}:</span>
              <span class="detail-value">${totalSettlements}</span>
            </div>
          </div>

          <div class="amount-box">
            <p>${amountRequiredLabel}</p>
            <div class="amount">${amountRequired}</div>
          </div>

          <p>${instructions}</p>

          <div class="warning">
            <p>⚠️ ${deadline}</p>
          </div>

          <div style="text-align: center;">
            <a href="${depositLink}" class="button">${buttonText}</a>
          </div>

          <p>${support}</p>
        </div>

        <div class="footer">
          <p>${regards}</p>
          <p>${team}</p>
        </div>
      </div>
    </body>
    </html>
    `;
  }

  private async generateFrpPaymentRequestText(
    username: string,
    sessionName: string,
    sessionAddress: string,
    marketName: string,
    deliveryDate: Date,
    totalSettlements: number,
    amountRequired: string,
    depositLink: string,
    language: string = 'en',
  ): Promise<string> {
    const greeting = await this.i18n.translate('email.frpPaymentRequest.greeting', { lang: language });
    const message = await this.i18n.translate('email.frpPaymentRequest.message', { lang: language });
    const sessionLabel = await this.i18n.translate('email.frpPaymentRequest.sessionLabel', { lang: language });
    const marketLabel = await this.i18n.translate('email.frpPaymentRequest.marketLabel', { lang: language });
    const deliveryDateLabel = await this.i18n.translate('email.frpPaymentRequest.deliveryDateLabel', { lang: language });
    const totalSettlementsLabel = await this.i18n.translate('email.frpPaymentRequest.totalSettlementsLabel', { lang: language });
    const amountRequiredLabel = await this.i18n.translate('email.frpPaymentRequest.amountRequiredLabel', { lang: language });
    const instructions = await this.i18n.translate('email.frpPaymentRequest.instructions', { lang: language });
    const deadline = await this.i18n.translate('email.frpPaymentRequest.deadline', { lang: language });
    const support = await this.i18n.translate('email.frpPaymentRequest.support', { lang: language });
    const regards = await this.i18n.translate('email.frpPaymentRequest.regards', { lang: language });
    const team = await this.i18n.translate('email.frpPaymentRequest.team', { lang: language });

    const formattedDeliveryDate = deliveryDate.toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    return `
💰 ${greeting}

${username},

${message}

${sessionLabel}: ${sessionName}
Contract: ${sessionAddress}
${marketLabel}: ${marketName}
${deliveryDateLabel}: ${formattedDeliveryDate}
${totalSettlementsLabel}: ${totalSettlements}

${amountRequiredLabel}: ${amountRequired}

${instructions}

⚠️ ${deadline}

Deposit Link: ${depositLink}

${support}

${regards}
${team}
    `;
  }
}