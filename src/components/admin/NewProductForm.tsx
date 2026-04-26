'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { slugify } from '@/lib/admin/slug';

type Option = { id: string; name: string; slug: string };

type Props = {
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

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * /admin/products/new — single-screen creation form. Submits a
 * multipart payload (so the optional image rides along) to
 * /api/admin/products/create/. On success we toast + redirect to the
 * products list. Errors come back keyed by field for inline display.
 */
export function NewProductForm({ brands, categories }: Props) {
  const router = useRouter();

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [retailPrice, setRetailPrice] = useState('');
  const [categorySlug, setCategorySlug] = useState(categories[0]?.slug ?? '');
  const [brandSlug, setBrandSlug] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState<File | null>(null);

  // Advanced
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [weightLb, setWeightLb] = useState('');
  const [slugOverride, setSlugOverride] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isFeatured, setIsFeatured] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const computedSlug = slugOverride.trim() || slugify(name);

  function onImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setImage(null);
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
    setSuccessMessage(null);
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

      const res = await fetch('/api/admin/products/create/', {
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
        if (data.fieldErrors) {
          setErrors(data.fieldErrors);
        } else {
          setErrors({ general: data.errorMessage ?? 'Could not create product.' });
        }
        setSubmitting(false);
        return;
      }

      setSuccessMessage(`Product created — ${data.product?.name ?? name}`);
      // Brief pause so the success banner renders, then bounce back to
      // the products list where the new row appears.
      setTimeout(() => {
        router.push('/admin/products/');
        router.refresh();
      }, 900);
    } catch (err) {
      console.error('[new-product] submit failed', err);
      setErrors({ general: 'Network error. Try again.' });
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-10 lg:grid-cols-[1fr_320px] max-lg:gap-6">
      <div className="flex flex-col gap-8">
        {successMessage && (
          <div
            className="bg-cream"
            style={{ border: '1px solid var(--rule-strong)', padding: '14px 18px' }}
            role="status"
          >
            <p className="type-data-mono text-gold">{successMessage}</p>
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
                autoFocus
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

        <Section title="Images">
          <Field
            label="Product image (optional)"
            error={errors.image}
            hint="JPEG, PNG, or WebP. Up to 8 MB. Single image initially — multi-image upload coming later."
            input={
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={onImageChange}
                className="font-mono text-[12px] text-ink"
              />
            }
          />
          {image && (
            <p className="type-data-mono text-ink-muted">
              Selected: {image.name} · {(image.size / 1024).toFixed(0)} KB
            </p>
          )}
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
                  hint="Defaults to 0 if blank."
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
                  hint={`Auto-generated as: ${computedSlug || '(empty)'}`}
                  input={
                    <input
                      value={slugOverride}
                      onChange={(e) => setSlugOverride(e.target.value)}
                      placeholder={slugify(name)}
                      maxLength={80}
                      className={inputClass}
                      style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                    />
                  }
                />
              </div>
              <Field
                label="Meta description"
                hint="For search engines and social previews. 50–160 characters is ideal."
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
            <Stat label="Image" value={image ? image.name : '— (placeholder will render)'} />
          </dl>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className={`btn btn-solid w-full justify-center ${submitting ? 'opacity-60 cursor-wait' : ''}`}
          style={{ padding: '16px 22px' }}
        >
          <span>{submitting ? 'Creating…' : 'Create Product'}</span>
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
  );
}

/* ─── Layout helpers ───────────────────────────────────────────────────── */

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
