'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from './auth-provider';
import { useCommerce } from './commerce-provider';

type CommerceActionProps =
  | { itemType: 'IPHONE'; inventoryCode: string; available?: boolean }
  | { itemType: 'ACCESSORY'; variantId: string; available: boolean };

export function CommerceActions(props: CommerceActionProps) {
  const { status, user } = useAuth();
  const { addIphone, addAccessory, addWishlistIphone, addWishlistAccessory } = useCommerce();
  const [quantity, setQuantity] = useState(1);
  const [pending, setPending] = useState<'cart' | 'wishlist' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const storefrontActor = status !== 'authenticated' || user?.role === 'CUSTOMER';
  const available = props.available ?? true;

  const addToCart = async () => {
    setPending('cart');
    setMessage(null);
    try {
      if (props.itemType === 'IPHONE') await addIphone(props.inventoryCode);
      else await addAccessory(props.variantId, quantity);
      setMessage('Đã thêm vào giỏ hàng.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể thêm vào giỏ hàng.');
    } finally {
      setPending(null);
    }
  };

  const addToWishlist = async () => {
    setPending('wishlist');
    setMessage(null);
    try {
      if (props.itemType === 'IPHONE') await addWishlistIphone(props.inventoryCode);
      else await addWishlistAccessory(props.variantId);
      setMessage('Đã lưu vào wishlist.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể lưu vào wishlist.');
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="commerce-actions">
      {props.itemType === 'ACCESSORY' ? (
        <label>
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
      <div className="actions">
        <button
          className="button primary"
          type="button"
          disabled={!available || !storefrontActor || pending !== null}
          onClick={() => void addToCart()}
        >
          {pending === 'cart' ? 'Đang thêm…' : 'Thêm vào giỏ'}
        </button>
        {status === 'authenticated' && user?.role === 'CUSTOMER' ? (
          <button
            className="button"
            type="button"
            disabled={pending !== null}
            onClick={() => void addToWishlist()}
          >
            {pending === 'wishlist' ? 'Đang lưu…' : 'Lưu wishlist'}
          </button>
        ) : status === 'anonymous' ? (
          <Link className="button" href="/login">
            Đăng nhập để lưu
          </Link>
        ) : null}
      </div>
      {!storefrontActor ? (
        <p className="muted">Tài khoản nhân viên không có giỏ mua hàng.</p>
      ) : null}
      <p className="commerce-message" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
