import { ApiErrorResponses } from '../../common/http/api-error-response.dto.js';
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ApiError } from '../../common/errors/api-error.js';
import { requestContext } from '../../common/http/request-context.js';
import { SessionGuard } from '../auth/session.guard.js';
import { OptionalSessionGuard } from '../auth/optional-session.guard.js';
import { GuestCommerceCsrfGuard } from '../auth/guest-commerce-csrf.guard.js';
import { CommerceRateLimitGuard } from '../auth/commerce-rate-limit.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { BackofficeRateLimitGuard } from '../auth/backoffice-rate-limit.guard.js';
import { BackofficeRateLimit } from '../auth/backoffice-rate-limit.decorator.js';
import { MAX_PRIVATE_EVIDENCE_BYTES } from '../storage/private-evidence.validator.js';
import { AffiliateProfileService } from './affiliate-profile.service.js';
import { AffiliateQueryService } from './affiliate-query.service.js';
import { AffiliatePayoutService } from './affiliate-payout.service.js';
import {
  AffiliateApplicationDto,
  AffiliateBankDto,
  AffiliateCompleteDto,
  AffiliateIdDto,
  AffiliateListDto,
  AffiliateOverrideDto,
  AffiliatePayoutActionDto,
  AffiliatePolicyDto,
  AffiliateRecordResponse,
  AffiliateReferralDto,
  AffiliateTokenDto,
  AffiliateTransitionDto,
  AffiliateWithdrawalDto,
} from './affiliate.dto.js';
const AFFILIATE_ERRORS = [
  { status: 400 as const, description: 'VALIDATION_FAILED' },
  { status: 401 as const, description: 'AUTH_REQUIRED' },
  { status: 403 as const, description: 'FORBIDDEN or CSRF_VALIDATION_FAILED' },
  { status: 404 as const, description: 'RESOURCE_NOT_FOUND' },
  {
    status: 409 as const,
    description: 'INVALID_STATE_TRANSITION, DUPLICATE_RESOURCE or CONCURRENT_MODIFICATION',
  },
  { status: 422 as const, description: 'ONE_TIME_TOKEN_INVALID or invalid financial state' },
  { status: 429 as const, description: 'RATE_LIMITED' },
  { status: 503 as const, description: 'SERVICE_UNAVAILABLE' },
];
function actor(req: Request) {
  if (!req.auth) throw new ApiError('AUTH_REQUIRED');
  return { ...requestContext(req), actorUserId: req.auth.userId };
}
@ApiErrorResponses(...AFFILIATE_ERRORS)
@ApiTags('Affiliate public')
@Controller('affiliate-program')
export class AffiliatePublicController {
  public constructor(
    @Inject(AffiliateProfileService) private readonly profiles: AffiliateProfileService,
    @Inject(AffiliateQueryService) private readonly query: AffiliateQueryService,
  ) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AffiliateRecordResponse })
  public config() {
    return this.profiles.configuration();
  }
  @Post('referrals')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(OptionalSessionGuard, GuestCommerceCsrfGuard, CommerceRateLimitGuard)
  @ApiOkResponse({ type: AffiliateRecordResponse })
  public refer(@Body() input: AffiliateReferralDto, @Res({ passthrough: true }) res: Response) {
    return this.query.refer(input.code, res);
  }
}
@ApiErrorResponses(...AFFILIATE_ERRORS)
@ApiTags('Affiliate portal')
@ApiBearerAuth('access-token')
@UseGuards(SessionGuard, RolesGuard, BackofficeRateLimitGuard)
@Roles('CUSTOMER')
@Controller('affiliate')
export class AffiliatePortalController {
  public constructor(
    @Inject(AffiliateProfileService) private readonly profiles: AffiliateProfileService,
    @Inject(AffiliateQueryService) private readonly query: AffiliateQueryService,
    @Inject(AffiliatePayoutService) private readonly payouts: AffiliatePayoutService,
  ) {}
  @Get('profile')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AffiliateRecordResponse })
  public profile(@Req() req: Request) {
    return this.profiles.own(actor(req).actorUserId);
  }
  @Post('application')
  @HttpCode(200)
  @BackofficeRateLimit('mutation')
  @ApiOkResponse({ type: AffiliateRecordResponse })
  public apply(@Req() req: Request, @Body() input: AffiliateApplicationDto) {
    return this.profiles.apply(input, actor(req));
  }
  @Post('banks')
  @HttpCode(200)
  @BackofficeRateLimit('mutation')
  @ApiOkResponse({ type: AffiliateRecordResponse })
  public bank(@Req() req: Request, @Body() input: AffiliateBankDto) {
    return this.profiles.bank(input, actor(req));
  }
  @Post('banks/confirm')
  @HttpCode(200)
  @BackofficeRateLimit('mutation')
  @ApiOkResponse({ type: AffiliateRecordResponse })
  public confirm(@Req() req: Request, @Body() input: AffiliateTokenDto) {
    return this.profiles.confirmBank(input.token, actor(req));
  }
  @Get('dashboard')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AffiliateRecordResponse })
  public dashboard(@Req() req: Request, @Query() input: AffiliateListDto) {
    return this.query.dashboard(actor(req).actorUserId, input);
  }
  @Get('offers')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AffiliateRecordResponse })
  public offers(@Req() req: Request, @Query() input: AffiliateListDto) {
    return this.query.offers(input, actor(req).actorUserId);
  }
  @Post('payouts')
  @HttpCode(200)
  @BackofficeRateLimit('mutation')
  @ApiOkResponse({ type: AffiliateRecordResponse })
  public withdraw(@Req() req: Request, @Body() input: AffiliateWithdrawalDto) {
    return this.payouts.request(input.requestKey, actor(req));
  }
}
@ApiErrorResponses(...AFFILIATE_ERRORS)
@ApiTags('Affiliate administration')
@ApiBearerAuth('access-token')
@UseGuards(SessionGuard, RolesGuard, BackofficeRateLimitGuard)
@Roles('ADMIN')
@Controller('backoffice/affiliates')
export class AffiliateAdminController {
  public constructor(
    @Inject(AffiliateProfileService) private readonly profiles: AffiliateProfileService,
    @Inject(AffiliateQueryService) private readonly query: AffiliateQueryService,
    @Inject(AffiliatePayoutService) private readonly payouts: AffiliatePayoutService,
  ) {}
  @Get('policy') @ApiOkResponse({ type: AffiliateRecordResponse }) public policy() {
    return this.profiles.configuration(true);
  }
  @Post('policy')
  @HttpCode(200)
  @BackofficeRateLimit('mutation')
  @ApiOkResponse({ type: AffiliateRecordResponse })
  public savePolicy(@Req() req: Request, @Body() input: AffiliatePolicyDto) {
    return this.profiles.policy(input, actor(req));
  }
  @Get('members')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AffiliateRecordResponse })
  public members(@Query() input: AffiliateListDto) {
    return this.query.members(input);
  }
  @Post('members/:id')
  @HttpCode(200)
  @BackofficeRateLimit('mutation')
  @ApiOkResponse({ type: AffiliateRecordResponse })
  public transition(
    @Req() req: Request,
    @Param() params: AffiliateIdDto,
    @Body() input: AffiliateTransitionDto,
  ) {
    return this.profiles.transition(params.id, input, actor(req));
  }
  @Get('offers') @ApiOkResponse({ type: AffiliateRecordResponse }) public offers(
    @Query() input: AffiliateListDto,
  ) {
    return this.query.offers(input);
  }
  @Post('offers/:id')
  @HttpCode(200)
  @BackofficeRateLimit('mutation')
  @ApiOkResponse({ type: AffiliateRecordResponse })
  public override(
    @Req() req: Request,
    @Param() params: AffiliateIdDto,
    @Body() input: AffiliateOverrideDto,
  ) {
    return this.profiles.override(params.id, input, actor(req));
  }
  @Post('banks/:id/verify')
  @HttpCode(200)
  @BackofficeRateLimit('mutation')
  @ApiOkResponse({ type: AffiliateRecordResponse })
  public verify(@Req() req: Request, @Param() params: AffiliateIdDto) {
    return this.profiles.verifyBank(params.id, actor(req));
  }
  @Get('banks/:id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AffiliateRecordResponse })
  public bankDetails(@Req() req: Request, @Param() params: AffiliateIdDto) {
    return this.profiles.bankDetails(params.id, actor(req));
  }
  @Get('dashboard')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AffiliateRecordResponse })
  public dashboard(@Query() input: AffiliateListDto) {
    return this.query.dashboard(undefined, input);
  }
  @Post('reconcile')
  @HttpCode(200)
  @BackofficeRateLimit('mutation')
  @ApiOkResponse({ type: AffiliateRecordResponse })
  public reconcile() {
    return this.query.reconcileBatch();
  }
  @Get('payouts/:id/destination')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AffiliateRecordResponse })
  public destination(@Req() req: Request, @Param() params: AffiliateIdDto) {
    return this.payouts.destination(params.id, actor(req));
  }
  @Post('payouts/:id')
  @HttpCode(200)
  @BackofficeRateLimit('mutation')
  @ApiOkResponse({ type: AffiliateRecordResponse })
  public payoutAction(
    @Req() req: Request,
    @Param() params: AffiliateIdDto,
    @Body() input: AffiliatePayoutActionDto,
  ) {
    return this.payouts.action(params.id, input, actor(req));
  }
  @Post('payouts/:id/complete')
  @HttpCode(200)
  @BackofficeRateLimit('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_PRIVATE_EVIDENCE_BYTES, files: 1, fields: 3 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'transferReference', 'transferredAt', 'note'],
      properties: {
        file: { type: 'string', format: 'binary' },
        transferReference: { type: 'string' },
        transferredAt: { type: 'string', format: 'date-time' },
        note: { type: 'string' },
      },
    },
  })
  @ApiOkResponse({ type: AffiliateRecordResponse })
  public complete(
    @Req() req: Request,
    @Param() params: AffiliateIdDto,
    @Body() input: AffiliateCompleteDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.payouts.complete(params.id, input, file, actor(req));
  }
  @Get('payouts/:id/evidence')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AffiliateRecordResponse })
  public evidence(@Req() req: Request, @Param() params: AffiliateIdDto) {
    return this.payouts.evidence(params.id, actor(req));
  }
}
