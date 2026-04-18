import Link from 'next/link';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

type Variant = 'solid' | 'outline' | 'outline-gold';

type CommonProps = {
  variant?: Variant;
  arrow?: boolean;
  children: ReactNode;
  className?: string;
};

type AnchorProps = CommonProps & {
  href: string;
} & Omit<ComponentPropsWithoutRef<'a'>, 'href' | 'className' | 'children'>;

type ButtonProps = CommonProps & {
  href?: undefined;
} & Omit<ComponentPropsWithoutRef<'button'>, 'className' | 'children'>;

type Props = AnchorProps | ButtonProps;

const VARIANT_CLASS: Record<Variant, string> = {
  solid:          'btn btn-solid',
  outline:        'btn btn-outline',
  'outline-gold': 'btn btn-outline-gold',
};

export function Button(props: Props) {
  const { variant = 'solid', arrow = false, children, className = '', ...rest } = props;
  const cls = `${VARIANT_CLASS[variant]}${className ? ' ' + className : ''}`;

  const content = (
    <>
      <span>{children}</span>
      {arrow && <span className="btn-arrow" aria-hidden="true">→</span>}
    </>
  );

  if ('href' in props && props.href !== undefined) {
    const { href, ...anchorRest } = rest as AnchorProps;
    return (
      <Link href={href} className={cls} {...anchorRest}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" className={cls} {...(rest as ButtonProps)}>
      {content}
    </button>
  );
}
