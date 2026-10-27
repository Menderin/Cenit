import { Select } from '../../../shared/components/Select.js';
import type { ComponentProps } from 'react';

export function PurchaseSelect(props: ComponentProps<typeof Select>) {
  return <Select {...props} className="admin-button purchase-select-trigger" />;
}
