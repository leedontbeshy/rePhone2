'use client';

import { HeartIcon, ShoppingCartSimpleIcon } from '@phosphor-icons/react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui';
import { classNames } from '@/components/ui/class-names';
import { useAuth } from './auth-provider';
import { useCommerce } from './commerce-provider';
import styles from './commerce-actions.module.css';

type CommerceActionProps =
  | { itemType: 'IPHONE'; inventoryCode: string; available?: boolean; compact?: boolean }
  | { itemType: 'ACCESSORY'; variantId: string; available: boolean; compact?: boolean };

interface CommerceNotice {
  readonly text: string;
  readonly tone: 'error' | 'success';
}

export function CommerceActions(props: CommerceActionProps) {
  const { status, user } = useAuth();
  const { addIphone, addAccessory, addWishlistIphone, addWishlistAccessory } = useCommerce();
  const [quantity, setQuantity] = useState(1);
  const [pending, setPending] = useState<'cart' | 'wishlist' | null>(null);
  const [notice, setNotice] = useState<CommerceNotice | null>(null);
  const storefrontActor =
    status === 'anonymous' || (status === 'authenticated' && user?.role === 'CUSTOMER');
  const available = props.available ?? true;

  const addToCart = async () => {
    setPending('cart');
    setNotice(null);
    try {
      if (props.itemType === 'IPHONE') await addIphone(props.inventoryCode);
      else await addAccessory(props.variantId, quantity);
      setNotice({ text: 'Đã thêm vào giỏ hàng.', tone: 'success' });
    } catch (error) {
      setNotice({
        text: error instanceof Error ? error.message : 'Không thể thêm vào giỏ hàng.',
        tone: 'error',
      });
    } finally {
      setPending(null);
    }
  };

  const addToWishlist = async () => {
    setPending('wishlist');
    setNotice(null);
    try {
      if (props.itemType === 'IPHONE') await addWishlistIphone(props.inventoryCode);
      else await addWishlistAccessory(props.variantId);
      setNotice({
        text:
          props.itemType === 'IPHONE'
            ? 'Đã lưu máy vào danh sách.'
            : 'Đã lưu phụ kiện vào danh sách.',
        tone: 'success',
      });
    } catch (error) {
      setNotice({
        text: error instanceof Error ? error.message : 'Không thể lưu sản phẩm.',
        tone: 'error',
      });
    } finally {
      setPending(null);
    }
  };

  return (
    <div
      className={classNames(
        styles.root,
        'commerce-actions',
        props.compact === true && styles.compact,
        props.compact === true && 'commerce-actions-compact',
      )}
    >
      {props.itemType === 'ACCESSORY' ? (
        <label className={styles.quantityField}>
          Số lượng
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={99}
            value={quantity}
            onChange={(event) => {
              setQuantity(Math.min(99, Math.max(1, Number(event.target.value) || 1)));
            }}
          />
        </label>
      ) : null}
      <div className={classNames(styles.actions, 'actions')}>
        <Button
          className={styles.primaryAction}
          disabled={!available || !storefrontActor || pending !== null}
          iconLeading={<ShoppingCartSimpleIcon aria-hidden="true" size={20} />}
          loading={pending === 'cart'}
          loadingLabel="Đang thêm vào giỏ"
          onClick={() => void addToCart()}
        >
          {available ? 'Thêm vào giỏ' : 'Tạm hết hàng'}
        </Button>
        {!props.compact && status === 'authenticated' && user?.role === 'CUSTOMER' ? (
          <Button
            disabled={pending !== null}
            iconLeading={<HeartIcon aria-hidden="true" size={19} />}
            loading={pending === 'wishlist'}
            loadingLabel="Đang lưu máy"
            onClick={() => void addToWishlist()}
            variant="secondary"
          >
            Lưu máy
          </Button>
        ) : !props.compact && status === 'anonymous' ? (
          <Link className={styles.secondaryLink} href="/login">
            <HeartIcon aria-hidden="true" size={19} />
            Đăng nhập để lưu
          </Link>
        ) : null}
      </div>
      {!props.compact && status === 'authenticated' && user?.role !== 'CUSTOMER' ? (
        <p className={styles.actorMessage}>Tài khoản nhân viên không có giỏ mua hàng.</p>
      ) : null}
      <p
        className={classNames(
          styles.message,
          notice?.tone === 'error' && styles.errorMessage,
          'commerce-message',
        )}
        aria-live="polite"
      >
        {notice?.text}
      </p>
    </div>
  );
}
