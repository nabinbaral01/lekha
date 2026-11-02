import { toDecimalString } from '@pa/core';

/**
 * Every BigInt in this system is an amount in paisa (enforced by schema convention),
 * so JSON always carries money as an exact decimal rupee string: "78050.00".
 */
export function installBigIntJson() {
  (BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (this: bigint) {
    return toDecimalString(this);
  };
}
