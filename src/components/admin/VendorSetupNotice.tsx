export function VendorSetupNotice() {
  return (
    <section
      className="rounded-2xl border border-[var(--rule)] bg-paper-2 p-8"
      role="status"
    >
      <p className="type-label text-accent mb-3">Vendor workspace</p>
      <h1 className="type-display-2">A database update is needed.</h1>
      <p className="type-body mt-4 max-w-2xl">
        Vendor terms, warehouses, and purchase orders require the vendor setup
        migration before this workspace can load. Existing storefront browsing
        remains available.
      </p>
      <p className="type-data-mono mt-4">
        Setup file: 0006_vendor_warehouses_and_po.sql
      </p>
    </section>
  );
}
