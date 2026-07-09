/**
 * Rule registry. To add a new validation rule: create it under ./rules and add
 * it to this array. No other file needs to change.
 */
import type { ValidationRule } from '../types';
import { dnBelongsToPiRule } from './dnBelongsToPi';
import {
  deliveryWithoutInvoiceRule,
  duplicateInvoiceRule,
  invoiceQuantityMismatchRule,
  invoiceWithoutDeliveryRule,
  missingInvoiceRule,
} from './invoiceRelationship';
import { quantityNotExceedRule } from './quantityNotExceed';
import { shelfLifeRule } from './shelfLife';
import { skuExistsInPiRule } from './skuExistsInPi';

export const VALIDATION_RULES: ValidationRule[] = [
  dnBelongsToPiRule,
  quantityNotExceedRule,
  skuExistsInPiRule,
  shelfLifeRule,
  duplicateInvoiceRule,
  deliveryWithoutInvoiceRule,
  invoiceWithoutDeliveryRule,
  invoiceQuantityMismatchRule,
  missingInvoiceRule,
];

export const RULE_BY_CODE: Record<string, ValidationRule> = Object.fromEntries(
  VALIDATION_RULES.map((r) => [r.code, r]),
);
