import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ApiError } from '../../common/errors/api-error.js';
import { PaginatedApiResult } from '../../common/http/api-response.interceptor.js';
import { OrderOwnershipPolicy } from '../order-transaction-ports/order-ownership.policy.js';
import type {
  BackofficeWarrantyListQueryDto,
  WarrantyPaginationDto,
  WarrantyPolicyListQueryDto,
} from './warranty.dto.js';
import { WarrantyClock } from './warranty-clock.service.js';
import { WarrantyOperationsRepository } from './warranty-operations.repository.js';
import { WarrantyPolicyReader } from './warranty-policy.reader.js';
import {
  projectBackofficeWarrantyDetail,
  projectBackofficeWarrantyListItem,
  projectWarrantyDetail,
  projectWarrantyListItem,
  projectWarrantyPolicy,
} from './warranty.projector.js';

@Injectable()
export class WarrantyQueryService {
  public constructor(
    @Inject(WarrantyOperationsRepository)
    private readonly repository: WarrantyOperationsRepository,
    @Inject(WarrantyPolicyReader) private readonly policies: WarrantyPolicyReader,
    @Inject(OrderOwnershipPolicy) private readonly ownership: OrderOwnershipPolicy,
    @Inject(WarrantyClock) private readonly clock: WarrantyClock,
  ) {}

  public async listCustomer(customerId: string, query: WarrantyPaginationDto) {
    const now = this.clock.now();
    const page = await this.repository.listCustomer(customerId, query);
    return new PaginatedApiResult(
      page.items.map((warranty) => projectWarrantyListItem(warranty, now)),
      pagination(query, page.totalItems),
    );
  }

  public async getCustomer(request: Request, warrantyCode: string) {
    const warranty = await this.repository.findByCode(warrantyCode);
    if (warranty === null) throw new ApiError('RESOURCE_NOT_FOUND');
    try {
      this.ownership.assertAccess(request, warranty.orderItem.order);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'ORDER_NOT_FOUND') {
        throw new ApiError('RESOURCE_NOT_FOUND');
      }
      throw error;
    }
    return projectWarrantyDetail(warranty, this.clock.now());
  }

  public async listPolicies(query: WarrantyPolicyListQueryDto) {
    const page = await this.repository.listPolicies(query);
    return new PaginatedApiResult(
      page.items.map(projectWarrantyPolicy),
      pagination(query, page.totalItems),
    );
  }

  public async getPolicy(id: string) {
    const policy = await this.policies.findById(id);
    if (policy === null) throw new ApiError('RESOURCE_NOT_FOUND');
    return projectWarrantyPolicy(policy);
  }

  public async listBackoffice(query: BackofficeWarrantyListQueryDto) {
    const now = this.clock.now();
    const page = await this.repository.listBackoffice(query, now);
    return new PaginatedApiResult(
      page.items.map((warranty) => projectBackofficeWarrantyListItem(warranty, now)),
      pagination(query, page.totalItems),
    );
  }

  public async getBackoffice(id: string) {
    const warranty = await this.repository.findById(id);
    if (warranty === null) throw new ApiError('RESOURCE_NOT_FOUND');
    return projectBackofficeWarrantyDetail(warranty, this.clock.now());
  }
}

function pagination(query: { page: number; pageSize: number }, totalItems: number) {
  return {
    page: query.page,
    pageSize: query.pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / query.pageSize),
  };
}
