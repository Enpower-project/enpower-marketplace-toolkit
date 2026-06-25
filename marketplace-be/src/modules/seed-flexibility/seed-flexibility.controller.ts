import {
  Body,
  Controller,
  Logger,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOAuth2, ApiTags } from '@nestjs/swagger';
import { Roles } from 'nest-keycloak-connect';
import { SeedFlexibilityDto } from 'src/dtos/seed-flexibility.dto';
import { UploadFlexibilityDto } from 'src/dtos/upload-flexibility.dto';
import { SeedFlexibilityService } from './seed-flexibility.service';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { diskStorage } = require('multer');
import * as os from 'os';
import * as path from 'path';

@ApiTags('seed-flexibility')
@ApiOAuth2(['openid'], 'keycloak')
@Controller('seed-flexibility')
export class SeedFlexibilityController {
  private readonly logger = new Logger(SeedFlexibilityController.name);

  constructor(private readonly seedService: SeedFlexibilityService) {}

  /** Seed historical flexibility data from a fixed whitelist of CSV files. Restricted to FMO_LMO realm role. */
  @Post('seed-flexibility-data')
  @Roles({ roles: ['realm:FMO_LMO'] })
  async seed(@Body() dto: SeedFlexibilityDto) {
    this.logger.log(`Seeding the fsp: ${dto.fsp} for market: ${dto.market}`);
    return this.seedService.runSeed(dto.market, dto.fsp);
  }

  /** Upload a historical data file (Excel or CSV) and run the full ingestion pipeline. Restricted to FMO_LMO realm role. */
  @Post('upload')
  @Roles({ roles: ['realm:FMO_LMO'] })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: os.tmpdir(),
        filename: (_req, file, cb) =>
          cb(null, `enpower_${Date.now()}${path.extname(file.originalname)}`),
      }),
      limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
    }),
  )
  async upload(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @UploadedFile() file: any,
    @Body() dto: UploadFlexibilityDto,
  ) {
    this.logger.log(`Upload received for FSP ${dto.fsp}, market ${dto.market}, file: ${file?.originalname}`);
    return this.seedService.processUpload(file, dto.market, dto.fsp);
  }
}
