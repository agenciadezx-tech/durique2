/** Logo da clínica (ou iniciais na cor da marca) para as páginas que o paciente abre. */
export type PublicBrand = { name: string; logo: string | null; color: string | null; tagline?: string | null; address?: string | null };

export function ClinicMark({ brand, size = 40 }: { brand: Pick<PublicBrand, "name" | "logo" | "color">; size?: number }) {
  const ini = brand.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return brand.logo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={brand.logo} alt={brand.name} className="shrink-0 rounded-xl border border-line bg-white object-contain" style={{ width: size, height: size }} />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-xl font-bold text-white" style={{ width: size, height: size, background: brand.color ?? "#0f766e", fontSize: size * 0.36 }} aria-hidden>
      {ini}
    </span>
  );
}

/** Cabeçalho com a marca da clínica (documento e pré-avaliação). */
export function BrandHeader({ brand }: { brand: PublicBrand }) {
  return (
    <header className="mb-6 flex items-center gap-3 border-b-2 pb-4" style={{ borderColor: brand.color ?? "#0f766e" }}>
      <ClinicMark brand={brand} size={44} />
      <div className="min-w-0">
        <p className="truncate font-semibold">{brand.name}</p>
        {(brand.tagline || brand.address) && <p className="truncate text-sm text-muted">{brand.tagline || brand.address}</p>}
      </div>
    </header>
  );
}
