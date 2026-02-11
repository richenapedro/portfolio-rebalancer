import Link from "next/link";

function FeatureCard(props: { title: string; desc: string }) {
  return (
    <div
      className="bg-[var(--surface)] rounded-xl p-5 space-y-2
                 border border-[var(--border)]
                 shadow-sm hover:shadow-md
                 hover:bg-[var(--surface-alt)] transition"
    >
      <div className="font-semibold text-[var(--text-primary)]">{props.title}</div>
      <div className="text-sm text-[var(--text-muted)]">{props.desc}</div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="space-y-10">
      {/* HERO */}
      <section
        className="bg-[var(--surface)] rounded-2xl p-10
                   border border-[var(--border)]
                   shadow-sm dark:shadow-black/30"
      >
        <div className="space-y-5 max-w-2xl">
          <h1 className="text-3xl md:text-4xl font-semibold leading-tight text-[var(--heading)]">
            Seu painel para decisões melhores de investimento
          </h1>

          <p className="text-[var(--text-muted)]">
            Ferramentas para organizar carteira, simular aportes e automatizar rebalanceamentos —
            começando pelo Brasil (B3).
          </p>

          <div className="flex flex-wrap gap-3">
            {/* Primary */}
            <Link
              href="/tools"
              className="cursor-pointer rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold
                         text-[var(--on-primary)] hover:bg-[var(--primary-hover)] transition"
            >
              Ver ferramentas
            </Link>

            {/* Secondary */}
            <Link
              href="/tools/rebalance"
              className="cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium
                         text-[var(--text-primary)] hover:bg-[var(--surface-alt)] transition"
            >
              Ir direto ao rebalanceamento
            </Link>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-[var(--heading)]">Principais recursos</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FeatureCard
            title="Rebalanceamento por aporte"
            desc="Diga quanto vai aportar e receba uma lista de trades para aproximar sua alocação alvo."
          />
          <FeatureCard
            title="Import B3 (XLSX)"
            desc="Faça upload do arquivo de posição da B3 e rode jobs assíncronos com tracking."
          />
          <FeatureCard
            title="Alocação por classe"
            desc="Defina proporções (Ações/FIIs/Tesouro) e aplique o rebalance conforme sua estratégia."
          />
          <FeatureCard
            title="Relatório de trades"
            desc="Tabela com filtros, busca e total investido — pronto para execução manual."
          />
          <FeatureCard
            title="Histórico (em breve)"
            desc="Salve jobs, compare antes/depois e acompanhe evolução da carteira."
          />
          <FeatureCard
            title="Mais ferramentas"
            desc="Calculadoras e análises como preço justo, dividendos e screening (roadmap)."
          />
        </div>
      </section>
    </main>
  );
}
