import Link from "next/link";

function ToolCard(props: { title: string; desc: string; href: string }) {
  return (
    <Link href={props.href} className="block border bg-[var(--surface)] rounded p-4 hover:shadow-sm">
      <div className="font-semibold">{props.title}</div>
      <div className="text-sm text-gray-600 mt-1">{props.desc}</div>
      <div className="text-sm font-medium mt-3">Abrir →</div>
    </Link>
  );
}

export default function ToolsPage() {
  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Ferramentas</h1>
        <p className="text-gray-600">Escolha uma ferramenta para começar.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ToolCard
          title="Rebalanceamento (B3)"
          desc="Upload XLSX + jobs assíncronos + trades sugeridos."
          href="/tools/rebalance"
        />
        <ToolCard
          title="Calculadoras (em breve)"
          desc="Preço justo, dividendos, aportes e mais."
          href="/tools/calculators"
        />
      </div>
    </main>
  );
}
