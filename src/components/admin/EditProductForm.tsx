'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { slugify } from '@/lib/admin/slug';

type Option = { id: string; name: string; slug: string };

export type EditProductInitial = {
  id: string;
  name: string;
  sku: string;
  retailPrice: number;
  categorySlug: string;
  brandSlug: string;
  description: string;
  weightLb: number | null;
  slug: string;
  metaDescription: string;
  isActive: boolean;
  isFeatured: boolean;
  imageUrl: string | null;
};

type Props = {
  product: EditProductInitial;
  brands: Option[];
  categories: Option[];
};

type FieldErrors = Partial<{
  name: string;
  sku: string;
  retail_price: string;
  category_slug: string;
  brand_slug: string;
  description: string;
  slug: string;
  image: string;
  general: string;
}>;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * /admin/products/[id] edit form. Mirrors NewProductForm field-for-field
 * but pre-populates from existing product data and POSTs multipart to
 * /api/admin/products/[id]/update/.
 *
 * Image handling: shows the current image (if any) above the file input;
 * if the user picks a new file we'll replace, otherwise the current
 * image stays untouched. There is no "remove image" affordance here —
 * keeping it simple per spec.
 *
 * Delete: separate destructive section at the bottom with a single
 * confirm() guard before posting to /delete/. Backend may decline the
 * delete if the product has historical orders; we surface that as a
 * warning toast and stay on the page so the admin can flip
 * "Visible on storefront" instead.
 */
export function EditProductForm({ product, brands, categories }: Props) {
  const router = useRouter();

  const [name, setName] = useState(product.name);
  const [sku, setSku] = useState(product.sku);
  const [retailPrice, setRetailPrice] = useState(product.retailPrice.toFixed(2));
  const [categorySlug, setCategorySlug] = useState(product.categorySlug);
  const [brandSlug, setBrandSlug] = useState(product.brandSlug);
  const [description, setDescription] = useState(product.description);
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Advanced
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [weightLb, setWeightLb] = useState(
    product.weightLb != null ? String(product.weightLb) : '',
  );
  const [slugOverride, setSlugOverride] = useState(product.slug);
  const [metaDescription, setMetaDescription] = useState(product.metaDescription);
  const [isActive, setIsActive] = useState(product.isActive);
  const [isFeatured, setIsFeatured] = useState(product.isFeatured);

  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);

  const computedSlug = slugOverride.trim() || slugify(name);

  function onImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setImage(null);
      setImagePreview(null);
      setErrors((p) => ({ ...p, image: undefined }));
      return;
    }
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setErrors((p) => ({ ...p, image: 'JPEG, PNG, or WebP only.' }));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setErrors((p) => ({ ...p, image: 'Image must be under 8 MB.' }));
      return;
    }
    setErrors((p) => ({ ...p, image: undefined }));
    setImage(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function validateClient(): FieldErrors {
    const next: FieldErrors = {};
    if (name.trim().length < 2 || name.trim().length > 200) {
      next.name = 'Name must be 2–200 characters.';
    }
    if (!/^[a-zA-Z0-9_-]{2,50}$/.test(sku.trim())) {
      next.sku = 'SKU must be 2–50 alphanumeric characters, dashes, or underscores.';
    }
    const priceNum = Number(retailPrice);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      next.retail_price = 'Price must be a positive number.';
    } else if (Math.round(priceNum * 100) !== priceNum * 100) {
      next.retail_price = 'Price must have at most two decimal places.';
    }
    if (!categorySlug) next.category_slug = 'Pick a category.';
    if (!brandSlug) next.brand_slug = 'Pick a brand.';
    const desc = description.trim();
    if (desc.length < 10 || desc.length > 5000) {
      next.description = 'Description must be 10–5,000 characters.';
    }
    if (computedSlug.length < 2) {
      next.slug = 'Could not generate a slug. Provide one in Advanced.';
    }
    return next;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    const v = validateClient();
    setErrors(v);
    if (Object.values(v).some(Boolean)) return;

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set('name', name.trim());
      fd.set('sku', sku.trim());
      fd.set('retail_price', String(Number(retailPrice).toFixed(2)));
      fd.set('category_slug', categorySlug);
      fd.set('brand_slug', brandSlug);
      fd.set('description', description.trim());
      fd.set('slug', computedSlug);
      fd.set('weight_lb', weightLb.trim() || '0');
      fd.set('meta_description', metaDescription.trim());
      fd.set('is_active', isActive ? 'true' : 'false');
      fd.set('is_featured', isFeatured ? 'true' : 'false');
      if (image) fd.set('image', image);

      const res = await fetch(`/api/admin/products/${product.id}/update/`, {
        method: 'POST',
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        errorMessage?: string;
        fieldErrors?: FieldErrors;
        product?: { id: string; slug: string; name: string };
      };

      if (!res.ok || !data.ok) {
        if (data.fieldErrors) setErrors(data.fieldErrors);
        else setErrors({ general: data.errorMessage ?? 'Could not save changes.' });
        setSubmitting(false);
        return;
      }

      setMessage(`Saved — ${data.product?.name ?? name}`);
      setTimeout(() => {
        router.push('/admin/products/');
        router.refresh();
      }, 700);
    } catch (err) {
      console.error('[edit-product] submit failed', err);
      setErrors({ general: 'Network error. Try again.' });
      setSubmitting(false);
    }
  }

  async function onDelete() {
    if (deleting || submitting) return;
    const ok = window.confirm(
      `Delete "${product.name}"? This cannot be undone — the product will disappear from the storefront immediately.`,
    );
    if (!ok) return;
    setDeleting(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/products/${product.id}/delete/`, {
        method: 'POST',
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        deleted?: boolean;
        deactivated?: boolean;
        errorMessage?: string;
      };

      if (!res.ok || !data.ok) {
        setErrors({ general: data.errorMessage ?? 'Could not delete product.' });
        setDeleting(false);
        return;
      }

      if (data.deactivated) {
        // Backend declined the hard delete because of order history;
        // it deactivated the product instead. Reflect that state and
        // surface a friendly message.
        setMessage(
          'Product has historical orders, so it was hidden from the storefront instead of deleted. The order history is preserved.',
        );
        setIsActive(false);
        setDeleting(false);
        return;
      }

      // Hard-deleted — bounce back to the list.
      router.push('/admin/products/');
      router.refresh();
    } catch (err) {
      console.error('[edit-product] delete failed', err);
      setErrors({ general: 'Network error. Try again.' });
      setDeleting(false);
    }
  }

  const hasNewImage = !!image && !!imagePreview;

  return (
    <>
      <form onSubmit={onSubmit} noValidate className="grid gap-10 lg:grid-cols-[1fr_320px] max-lg:gap-6">
        <div className="flex flex-col gap-8">
          {message && (
            <div
              className="bg-cream"
              style={{ border: '1px solid var(--rule-strong)', padding: '14px 18px' }}
              role="status"
            >
              <p className="type-data-mono text-gold">{message}</p>
            </div>
          )}
          {errors.general && (
            <div
              className="bg-cream"
              style={{ border: '1px solid var(--accent)', padding: '14px 18px' }}
              role="alert"
            >
              <p className="type-data-mono text-accent">{errors.general}</p>
            </div>
          )}

          <Section title="Basic info">
            <Field
              label="Product name"
              required
              error={errors.name}
              input={
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={200}
                  className={inputClass}
                  style={inputStyle}
                />
              }
            />
            <div className="grid gap-5 max-md:gap-4 sm:grid-cols-2">
              <Field
                label="SKU"
                required
                error={errors.sku}
                hint="Letters, numbers, dashes, underscores. Must be unique."
                input={
                  <input
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    maxLength={50}
                    className={inputClass}
                    style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                  />
                }
              />
              <Field
                label="Default price"
                required
                error={errors.retail_price}
                hint="USD. Two decimals max."
                input={
                  <div className="flex items-stretch">
                    <span
                      className="font-display text-ink-muted flex items-center px-3"
                      style={{ background: 'var(--color-paper-2)', border: '1px solid var(--rule-strong)', borderRight: 'none', fontSize: '15px' }}
                    >
                      $
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={retailPrice}
                      onChange={(e) => setRetailPrice(e.target.value)}
                      className={`${inputClass} flex-1`}
                      style={inputStyle}
                    />
                  </div>
                }
              />
            </div>
            <div className="grid gap-5 max-md:gap-4 sm:grid-cols-2">
              <Field
                label="Category"
                required
                error={errors.category_slug}
                input={
                  <select
                    value={categorySlug}
                    onChange={(e) => setCategorySlug(e.target.value)}
                    className={inputClass}
                    style={inputStyle}
                  >
                    <option value="">Select…</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                }
              />
              <Field
                label="Brand"
                required
                error={errors.brand_slug}
                input={
                  <select
                    value={brandSlug}
                    onChange={(e) => setBrandSlug(e.target.value)}
                    className={inputClass}
                    style={inputStyle}
                  >
                    <option value="">Select…</option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.slug}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                }
              />
            </div>
            <Field
              label="Description"
              required
              error={errors.description}
              hint="10–5,000 characters. Line breaks OK."
              input={
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={5000}
                  rows={6}
                  className={inputClass}
                  style={inputStyle}
                />
              }
            />
          </Section>

          <Section title="Image">
            {(hasNewImage || product.imageUrl) && (
              <div className="flex flex-col gap-3">
                <p className="type-data-mono text-ink-muted">
                  {hasNewImage ? 'New image (unsaved)' : 'Current image'}
                </p>
                <div
                  className="relative bg-paper-2 self-start"
                  style={{
                    border: '1px solid var(--rule-strong)',
                    width: 200,
                    height: 200,
                  }}
                >
                  {hasNewImage ? (
                    <img
                      src={imagePreview!}
                      alt="New product image preview"
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  ) : product.imageUrl ? (
                    <Image
                      src={product.imageUrl}
                      alt={product.name}
                      width={400}
                      height={400}
                      sizes="200px"
                      className="w-full h-full object-contain"
                    />
                  ) : null}
                </div>
              </div>
            )}
            <Field
              label={product.imageUrl ? 'Replace image (optional)' : 'Product image (optional)'}
              error={errors.image}
              hint="JPEG, PNG, or WebP. Up to 8 MB. Leave blank to keep the current image."
              input={
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={onImageChange}
                  className="font-mono text-[12px] text-ink"
                />
              }
            />
          </Section>

          <Section
            title="Advanced (optional)"
            collapsible
            open={advancedOpen}
            onToggle={() => setAdvancedOpen((v) => !v)}
          >
            {advancedOpen && (
              <>
                <div className="grid gap-5 max-md:gap-4 sm:grid-cols-2">
                  <Field
                    label="Weight (lbs)"
                    input={
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        value={weightLb}
                        onChange={(e) => setWeightLb(e.target.value)}
                        className={inputClass}
                        style={inputStyle}
                      />
                    }
                  />
                  <Field
                    label="URL slug"
                    error={errors.slug}
                    hint={`Current: ${computedSlug || '(empty)'}`}
                    input={
                      <input
                        value={slugOverride}
                        onChange={(e) => setSlugOverride(e.target.value)}
                        maxLength={80}
                        className={inputClass}
                        style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                      />
                    }
                  />
                </div>
                <Field
                  label="Meta description"
                  hint="For search engines and social previews."
                  input={
                    <textarea
                      value={metaDescription}
                      onChange={(e) => setMetaDescription(e.target.value)}
                      maxLength={300}
                      rows={3}
                      className={inputClass}
                      style={inputStyle}
                    />
                  }
                />
                <div className="flex flex-col gap-3">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="accent-brand-deep"
                      style={{ width: 16, height: 16 }}
                    />
                    <span className="font-display text-ink-2" style={{ fontSize: '14px' }}>
                      Visible on storefront
                    </span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isFeatured}
                      onChange={(e) => setIsFeatured(e.target.checked)}
                      className="accent-brand-deep"
                      style={{ width: 16, height: 16 }}
                    />
                    <span className="font-display text-ink-2" style={{ fontSize: '14px' }}>
                      Featured product
                    </span>
                  </label>
                </div>
              </>
            )}
          </Section>
        </div>

        <aside className="flex flex-col gap-3 self-start lg:sticky lg:top-6">
          <div
            className="bg-cream"
            style={{ border: '1px solid var(--rule-strong)', padding: '20px 22px' }}
          >
            <p className="type-label text-ink mb-3">§ Summary</p>
            <dl className="flex flex-col gap-2">
              <Stat label="Name" value={name || '—'} />
              <Stat label="SKU" value={sku || '—'} mono />
              <Stat label="Slug" value={computedSlug || '—'} mono />
              <Stat label="Price" value={retailPrice ? `$${retailPrice}` : '—'} />
              <Stat label="Category" value={categories.find((c) => c.slug === categorySlug)?.name ?? '—'} />
              <Stat label="Brand" value={brands.find((b) => b.slug === brandSlug)?.name ?? '—'} />
              <Stat
                label="Image"
                value={hasNewImage ? image!.name : product.imageUrl ? 'Current image' : '— (placeholder)'}
              />
            </dl>
          </div>

          <button
            type="submit"
            disabled={submitting || deleting}
            className={`btn btn-solid w-full justify-center ${submitting || deleting ? 'opacity-60 cursor-wait' : ''}`}
            style={{ padding: '16px 22px' }}
          >
            <span>{submitting ? 'Saving…' : 'Save changes'}</span>
            {!submitting && <span className="btn-arrow" aria-hidden="true">→</span>}
          </button>
          <Link
            href="/admin/products/"
            className="type-label-sm text-ink-muted hover:text-brand-deep text-center"
          >
            Cancel
          </Link>
        </aside>
      </form>

      <section className="mt-16 pt-8" style={{ borderTop: '1px solid var(--rule)' }}>
        <p className="type-label text-accent mb-3">§ Danger zone</p>
        <p className="type-data-mono text-ink-muted mb-4 max-w-[640px]">
          Deletes this product and its primary image. If the product has any
          historical order line items, it will be hidden from the storefront
          instead so order history stays intact.
        </p>
        <button
          type="button"
          onClick={onDelete}
          disabled={submitting || deleting}
          className={`type-label inline-flex items-center gap-2 ${submitting || deleting ? 'opacity-60 cursor-wait' : ''}`}
          style={{
            padding: '12px 20px',
            border: '1px solid var(--accent)',
            color: 'var(--color-accent)',
            background: 'transparent',
          }}
        >
          {deleting ? 'Deleting…' : 'Delete product'}
        </button>
      </section>
    </>
  );
}

/* ─── Layout helpers (mirror NewProductForm) ────────────────────────── */

const inputClass =
  'bg-paper text-ink font-display focus:outline-none focus:border-brand-deep transition-colors duration-200';

const inputStyle: React.CSSProperties = {
  border: '1px solid var(--rule-strong)',
  padding: '11px 14px',
  fontSize: '14px',
  lineHeight: 1.4,
  width: '100%',
};

function Section({
  title,
  children,
  collapsible = false,
  open = false,
  onToggle,
}: {
  title: string;
  children: React.ReactNode;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
}) {
  const headerInner = (
    <div className="flex items-baseline justify-between gap-4">
      <p className="type-label text-ink">§ {title}</p>
      {collapsible && (
        <span className="type-data-mono text-ink-muted">{open ? '▾ Hide' : '▸ Show'}</span>
      )}
    </div>
  );
  return (
    <div className="flex flex-col gap-5">
      {collapsible ? (
        <button
          type="button"
          onClick={onToggle}
          className="text-left w-full pb-3"
          style={{ borderBottom: '1px solid var(--rule)' }}
        >
          {headerInner}
        </button>
      ) : (
        <div className="pb-3" style={{ borderBottom: '1px solid var(--rule)' }}>
          {headerInner}
        </div>
      )}
      {children}
    </div>
  );
}

function Field({
  label,
  required,
  error,
  hint,
  input,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  input: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="type-label-sm text-ink">
        {label}
        {required && <span className="text-accent ml-1" aria-hidden="true">*</span>}
      </label>
      {input}
      {hint && !error && <span className="type-data-mono text-ink-muted">{hint}</span>}
      {error && <span className="type-data-mono text-accent" role="alert">{error}</span>}
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="type-data-mono text-ink-muted">{label}</dt>
      <dd
        className={`text-right truncate min-w-0 ${mono ? 'font-mono text-[12px]' : 'font-display text-[14px]'} text-ink`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}
