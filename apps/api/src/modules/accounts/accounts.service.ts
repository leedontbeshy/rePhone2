import { Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { CustomerAddress, User } from '../../generated/prisma/client.js';
import type { AuthContext } from '../auth/auth-context.js';
import type { CreateAddressDto, UpdateAccountDto, UpdateAddressDto } from './account.dto.js';
import type { AccountDto, AddressDto } from './account-response.dto.js';
import { AccountsRepository } from './accounts.repository.js';

@Injectable()
export class AccountsService {
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AccountsRepository) private readonly accountsRepository: AccountsRepository,
  ) {}

  public async getAccount(auth: AuthContext): Promise<AccountDto> {
    const user = await this.accountsRepository.findAccount(auth.userId);
    if (user === null) {
      throw new ApiError('RESOURCE_NOT_FOUND');
    }
    return toAccountDto(user);
  }

  public async updateAccount(auth: AuthContext, input: UpdateAccountDto): Promise<AccountDto> {
    const user = await this.accountsRepository.findAccount(auth.userId);
    if (user === null) {
      throw new ApiError('RESOURCE_NOT_FOUND');
    }
    const updated = await this.accountsRepository.updateAccount(auth.userId, {
      ...(input.fullName === undefined ? {} : { fullName: input.fullName.trim() }),
      ...(input.phone === undefined ? {} : { phone: input.phone }),
    });
    return toAccountDto(updated);
  }

  public async listAddresses(auth: AuthContext): Promise<AddressDto[]> {
    requireCustomer(auth);
    return (await this.accountsRepository.listAddresses(auth.userId)).map(toAddressDto);
  }

  public async createAddress(auth: AuthContext, input: CreateAddressDto): Promise<AddressDto> {
    requireCustomer(auth);
    const address = await this.prisma.$transaction(async (transaction) => {
      if (!(await this.accountsRepository.lockUser(auth.userId, transaction))) {
        throw new ApiError('RESOURCE_NOT_FOUND');
      }
      if (input.isDefault === true) {
        await this.accountsRepository.clearDefaultAddress(auth.userId, transaction);
      }
      return this.accountsRepository.createAddress(
        auth.userId,
        {
          receiverName: input.receiverName,
          phone: input.phone,
          addressLine: input.addressLine,
          ward: input.ward,
          district: input.district,
          province: input.province,
          isDefault: input.isDefault ?? false,
          ...(input.label === undefined ? {} : { label: input.label }),
          ...(input.postalCode === undefined ? {} : { postalCode: input.postalCode }),
        },
        transaction,
      );
    });
    return toAddressDto(address);
  }

  public async updateAddress(
    auth: AuthContext,
    addressId: string,
    input: UpdateAddressDto,
  ): Promise<AddressDto> {
    requireCustomer(auth);
    const address = await this.prisma.$transaction(async (transaction) => {
      if (!(await this.accountsRepository.lockUser(auth.userId, transaction))) {
        throw new ApiError('RESOURCE_NOT_FOUND');
      }
      const existing = await this.accountsRepository.findAddress(
        auth.userId,
        addressId,
        transaction,
      );
      if (existing === null) {
        throw new ApiError('RESOURCE_NOT_FOUND');
      }
      if (input.isDefault === true) {
        await this.accountsRepository.clearDefaultAddress(auth.userId, transaction);
      }
      return this.accountsRepository.updateAddress(
        existing.id,
        {
          ...(input.label === undefined ? {} : { label: input.label }),
          ...(input.receiverName === undefined ? {} : { receiverName: input.receiverName }),
          ...(input.phone === undefined ? {} : { phone: input.phone }),
          ...(input.addressLine === undefined ? {} : { addressLine: input.addressLine }),
          ...(input.ward === undefined ? {} : { ward: input.ward }),
          ...(input.district === undefined ? {} : { district: input.district }),
          ...(input.province === undefined ? {} : { province: input.province }),
          ...(input.postalCode === undefined ? {} : { postalCode: input.postalCode }),
          ...(input.isDefault === undefined ? {} : { isDefault: input.isDefault }),
        },
        transaction,
      );
    });
    return toAddressDto(address);
  }

  public async archiveAddress(auth: AuthContext, addressId: string): Promise<void> {
    requireCustomer(auth);
    await this.prisma.$transaction(async (transaction) => {
      if (!(await this.accountsRepository.lockUser(auth.userId, transaction))) {
        throw new ApiError('RESOURCE_NOT_FOUND');
      }
      const existing = await this.accountsRepository.findAddress(
        auth.userId,
        addressId,
        transaction,
      );
      if (existing === null) {
        throw new ApiError('RESOURCE_NOT_FOUND');
      }
      await this.accountsRepository.updateAddress(
        existing.id,
        { archivedAt: new Date() },
        transaction,
      );
    });
  }
}

function requireCustomer(auth: AuthContext): void {
  if (auth.role !== 'CUSTOMER') {
    throw new ApiError('FORBIDDEN');
  }
}

function toAccountDto(user: User): AccountDto {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    fullName: user.fullName,
    phone: user.phone,
    emailVerifiedAt: user.emailVerifiedAt,
    ...(user.role === 'CUSTOMER'
      ? {}
      : {
          staffProfile: {
            employeeCode: user.employeeCode ?? '',
            hiredAt: user.hiredAt,
          },
        }),
  };
}

function toAddressDto(address: CustomerAddress): AddressDto {
  return {
    id: address.id,
    label: address.label,
    receiverName: address.receiverName,
    phone: address.phone,
    addressLine: address.addressLine,
    ward: address.ward,
    district: address.district,
    province: address.province,
    postalCode: address.postalCode,
    isDefault: address.isDefault,
    createdAt: address.createdAt,
    updatedAt: address.updatedAt,
  };
}
