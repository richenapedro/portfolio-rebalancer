export type Lang = "pt-BR" | "en";

/**
 * Base dictionary (EN) is the source of truth for structure/keys.
 * We keep values as `string`, not literal types, to allow translations.
 */
export type Dict = {
  header: {
    brand: string;
    nav: { tools: string; portfolio: string; learn: string };
    auth: { login: string; signup: string };
  };

  common: {
    cancel: string;
    confirm: string;
    delete: string;
    new: string;
    select: string;
    add: string;
    clear: string;
    remove: string;
    dash: string;
    total: string;
  };

  portfolio: {
    title: string;
    subtitle: string;
    // dentro de type Dict { portfolio: { ... } }

    defaults: {
    portfolioName: string;
    };

    stats: {
    totalInvested: string;
    assets: string;
    };

    placeholders: {
    ticker: string;
    qty: string;
    priceOpt: string;
    };

    errors: {
    importNoFile: string;
    importFailed: string;
    manualPickValid: string;
    manualInvalidQty: string;
    manualInvalidPrice: string;
    saveNeedName: string;
    saveNameTaken: string;
    saveEmpty: string;
    saveFailed: string;
    deleteNeedSelect: string;
    deleteDone: string;
    };

    misc: {
    noAssets: string;
    noPositionsInFilter: string;
    noDataYet: string;
    noteDecrease: string;
    noteIncrease: string;
    remove: string;
    loadingAssets: string;
    fetchingPrice: string;
    searching: string;
    selectDbPortfolio: string;
    };

    db: {
      title: string;
      hint: string;
      updating: string;
      unsavedNew: string;
    };

    form: {
      nameLabel: string;
      uniqueHint: string;
      clearBtn: string;
    };

    importCard: {
      title: string;
      fileLabel: string;
      noneFile: string;
      importing: string;
      importBtn: string;
      hint: string;
    };

    manualCard: {
      title: string;
      asset: string;
      quantity: string;
      priceOpt: string;
    };

    allocation: {
      title: string;
      emptyHint: string;
      stocks: string;
      fiis: string;
      bonds: string;
      other: string;
    };

    save: {
      saving: string;
      create: string;
      update: string;
    };

    holdings: {
      title: string;
      baseWith: string;
      baseNone: string;
      items: string;
      tabs: { all: string; stocks: string; fiis: string; bonds: string; other: string };
      table: { asset: string; type: string; qty: string; price: string; value: string; note: string };
    };

    confirm: {
      clearTitle: string;
      clearDesc: string;
      deleteTitle: string;
      deleteDesc: string;
    };
  };

  rebalance: {
    title: string;
    subtitle: string;

    import: {
      label: string;
      importedFromFile: string;
      selectDbPlaceholder: string;
      fileBtn: string;
      fileBtnTitle: string;

      source: string;
      sourceFile: string;
      sourceDb: string;
      file: string;

      hint: string;

      titleWhenFile: string;
      titleWhenDb: string;
      fileChipTitle: string;

      remove: string;
      none: string;
    };

    target: {
      title: string;
      remaining: string;
    };

    controls: {
      cash: string;
      mode: string;
    };

    modes: {
      trade: string;
      buy: string;
      sell: string;
    };

    run: {
      run: string;
      running: string;
      runBtn: string;
      runningBtn: string;
    };

    errors: {
      weightsMustBe100: string;
      calcErrorTitle: string;
    };

    summary: {
      title: string;
    };

    tables: {
      beforeTitle: string;
      afterTitle: string;

      ticker: string;
      qty: string;
      price: string;
      value: string;
      action: string;

      empty: string;
      breakdownBefore: string;
      breakdownAfter: string;
    };

    allocation: {
      stocks: string;
      fiis: string;
      bonds: string;
    };

    trades: {
      title: string;
    };

    common: {
      total: string;
    };

    breakdown: {
        before: string;
        after: string;
    };

    hint: {
      tablesDependOn: string;
      holdingsBefore: string;
      holdingsAfter: string;
    };
  };
};

export const en: Dict = {
  header: {
    brand: "Portfolio App",
    nav: { tools: "Tools", portfolio: "Portfolio", learn: "Learn" },
    auth: { login: "Log in", signup: "Create account" },
  },

  common: {
    cancel: "Cancel",
    confirm: "Confirm",
    delete: "Delete",
    new: "New",
    select: "Select",
    add: "Add",
    clear: "Clear",
    remove: "Remove",
    dash: "—",
    total: "Total",
  },

  portfolio: {
    title: "Portfolio",
    subtitle: "Manage multiple portfolios and track allocation",
    defaults: {
    portfolioName: "My portfolio",
    },
    stats: {
    totalInvested: "Total invested",
    assets: "Assets",
    },
    placeholders: {
    ticker: "Type ticker (e.g., HGLG11, VALE3...)",
    qty: "e.g. 10",
    priceOpt: "uses DB/Prices if empty",
    },
    errors: {
    importNoFile: "Select a B3 XLSX file to import.",
    importFailed: "Failed to import file.",
    manualPickValid: "Pick a valid asset from the list.",
    manualInvalidQty: "Invalid quantity.",
    manualInvalidPrice: "Invalid price. Enter a price or ensure it exists in the DB.",
    saveNeedName: "Enter a portfolio name.",
    saveNameTaken: "A portfolio with this name already exists. Choose another name.",
    saveEmpty: "Nothing to save: the portfolio is empty.",
    saveFailed: "Failed to save to DB.",
    deleteNeedSelect: "Select a portfolio from the DB to delete.",
    deleteDone: "Portfolio deleted.",
    },
    misc: {
    noAssets: "no assets",
    noPositionsInFilter: "No positions in this filter.",
    noDataYet: "No data yet — import, pick from DB or add manually.",
    noteDecrease: "Decrease",
    noteIncrease: "Increase",
    remove: "Remove",
    loadingAssets: "Loading assets...",
    fetchingPrice: "Fetching price...",
    searching: "Searching...",
    selectDbPortfolio: "Select a DB portfolio",
    },

    db: {
      title: "Portfolios (database)",
      hint: "The list refreshes when you open/return to the tab and when saving/creating/deleting.",
      updating: "Updating list…",
      unsavedNew: "(New portfolio)",
    },

    form: {
      nameLabel: "Portfolio name",
      uniqueHint: "",
      clearBtn: "Clear portfolio",
    },

    importCard: {
      title: "Import B3 file",
      fileLabel: "File (XLSX)",
      noneFile: "No file",
      importing: "Importing...",
      importBtn: "Import",
      hint: 'Import updates the current screen edit. To persist in the database, click "Save to DB".',
    },

    manualCard: {
      title: "Add manually",
      asset: "Asset",
      quantity: "Quantity",
      priceOpt: "Price",
    },

    allocation: {
      title: "Current allocation",
      emptyHint: "No assets yet. Import a B3 XLSX or add manually to see allocation.",
      stocks: "Stocks",
      fiis: "REITs",
      bonds: "Bonds",
      other: "Other",
    },

    save: {
      saving: "Saving...",
      create: "Save Portfolio",
      update: "Update Portfolio",
    },

    holdings: {
      title: "Holdings",
      baseWith: "Base: {filename}",
      baseNone: "Base: (no import/DB)",
      items: "{count} items",
      tabs: { all: "All", stocks: "Stocks", fiis: "REITs", bonds: "Bonds", other: "Other" },
      table: { asset: "Asset", type: "Type", qty: "Qty", price: "Price", value: "Value", note: "Note" },
    },

    confirm: {
      clearTitle: "Are you sure you want to clear the portfolio?",
      clearDesc: "This clears the current screen edit. It does not delete the portfolio from the database.",
      deleteTitle: "Delete portfolio from database?",
      deleteDesc: "This removes the portfolio and all positions/import_runs from the database. It cannot be undone.",
    },
  },

  rebalance: {
    title: "Portfolio Rebalancer",
    subtitle: "B3 XLSX → trades + report",

    import: {
      label: "Import portfolio",
      importedFromFile: "Imported from file",
      selectDbPlaceholder: "Select a DB portfolio…",
      fileBtn: "Import file",
      fileBtnTitle: "Import B3 XLSX",

      source: "Source",
      sourceFile: "File",
      sourceDb: "Database",
      file: "File",

      hint: "• Selecting a DB portfolio imports automatically. • Import file opens the picker and imports automatically.",

      titleWhenFile: "Imported from file (use the dropdown to pick a DB portfolio instead).",
      titleWhenDb: "Select a DB portfolio to import automatically.",
      fileChipTitle: "You imported via file. To switch back to DB, pick a portfolio in the dropdown.",

      remove: "Remove",
      none: "—",
    },

    target: {
      title: "Target allocation",
      remaining: "Remaining",
    },

    controls: {
      cash: "Cash",
      mode: "Mode",
    },

    modes: {
      trade: "TRADE",
      buy: "BUY",
      sell: "SELL",
    },

    run: {
      run: "Run rebalance",
      running: "Running",
      runBtn: "Run rebalance",
      runningBtn: "Running",
    },

    errors: {
      weightsMustBe100: "Sliders must sum to 100% to calculate.",
      calcErrorTitle: "Calculation error",
    },

    summary: {
      title: "Summary",
    },

    tables: {
      beforeTitle: "Before rebalance",
      afterTitle: "After rebalance",

      ticker: "Ticker",
      qty: "Qty",
      price: "Price",
      value: "Value",
      action: "Action",

      empty: "No data.",
      breakdownBefore: "Breakdown (before)",
      breakdownAfter: "Breakdown (after)",
    },

    allocation: {
      stocks: "Stocks",
      fiis: "REITs",
      bonds: "Bonds / Fixed income",
    },

    trades: {
      title: "Trades",
    },
    common: {
        total: "Total",
    },
    breakdown: {
        before: "Breakdown (before)",
        after: "Breakdown (after)",
    },
    hint: {
      tablesDependOn: "⚠️ Tables depend on the backend returning",
      holdingsBefore: "holdings_before",
      holdingsAfter: "holdings_after",
    },
  },
};

export const ptBR: Dict = {
  header: {
    brand: "Portfolio App",
    nav: { tools: "Ferramentas", portfolio: "Carteira", learn: "Aprender" },
    auth: { login: "Entrar", signup: "Criar conta" },
  },

  common: {
    cancel: "Cancelar",
    confirm: "Confirmar",
    delete: "Excluir",
    new: "Nova",
    select: "Selecionar",
    add: "Adicionar",
    clear: "Limpar",
    remove: "Remover",
    dash: "—",
    total: "Total",
  },

  portfolio: {
    title: "Carteira",
    subtitle: "Gerencie múltiplas carteiras e acompanhe alocação",
    defaults: {
    portfolioName: "Minha carteira",
    },
    stats: {
    totalInvested: "Total investido",
    assets: "Ativos",
    },
    placeholders: {
    ticker: "Digite ticker (ex.: HGLG11, VALE3...)",
    qty: "ex.: 10",
    priceOpt: "usa BD/Prices se vazio",
    },
    errors: {
    importNoFile: "Selecione um arquivo B3 (XLSX) para importar.",
    importFailed: "Falha ao importar arquivo.",
    manualPickValid: "Selecione um ativo válido na lista.",
    manualInvalidQty: "Quantidade inválida.",
    manualInvalidPrice: "Preço inválido. Digite um preço ou garanta que exista no BD.",
    saveNeedName: "Digite um nome para a carteira.",
    saveNameTaken: "Já existe uma carteira com esse nome. Escolha outro nome.",
    saveEmpty: "Nada para salvar: a carteira está vazia.",
    saveFailed: "Falha ao salvar no banco.",
    deleteNeedSelect: "Selecione uma carteira do banco para excluir.",
    deleteDone: "Carteira excluída.",
    },
    misc: {
    noAssets: "sem ativos",
    noPositionsInFilter: "Nenhuma posição nesse filtro.",
    noDataYet: "Sem dados ainda — importe, selecione do banco ou adicione manualmente.",
    noteDecrease: "Diminuir",
    noteIncrease: "Aumentar",
    remove: "Remover",
    loadingAssets: "Carregando ativos...",
    fetchingPrice: "Buscando preço...",
    searching: "Buscando sugestões...",
    selectDbPortfolio: "Selecione uma carteira do banco",
    },

    db: {
      title: "Carteiras (banco)",
      hint: "A lista atualiza ao abrir/voltar pra aba e ao salvar/criar/excluir.",
      updating: "Atualizando lista…",
      unsavedNew: "(Nova carteira)",
    },

    form: {
      nameLabel: "Nome da carteira",
      uniqueHint: "",
      clearBtn: "Limpar carteira",
    },

    importCard: {
      title: "Importar arquivo B3",
      fileLabel: "Arquivo (XLSX)",
      noneFile: "Nenhum arquivo",
      importing: "Importando...",
      importBtn: "Importar",
      hint: 'Importar arquivo atualiza a edição da tela. Para gravar no banco, clique em “Salvar no banco”.',
    },

    manualCard: {
      title: "Adicionar manualmente",
      asset: "Ativo",
      quantity: "Quantidade",
      priceOpt: "Preço",
    },

    allocation: {
      title: "Alocação atual",
      emptyHint: "Nenhum ativo ainda. Importe um XLSX da B3 ou adicione manualmente para ver a alocação.",
      stocks: "Ações",
      fiis: "FIIs",
      bonds: "RF",
      other: "Outros",
    },

    save: {
      saving: "Salvando...",
      create: "Criar Carteira",
      update: "Atualizar Carteira",
    },

    holdings: {
      title: "Posições",
      baseWith: "Base: {filename}",
      baseNone: "Base: (sem import/DB)",
      items: "{count} itens",
      tabs: { all: "Tudo", stocks: "Ações", fiis: "FIIs", bonds: "RF", other: "Outros" },
      table: { asset: "Ativo", type: "Tipo", qty: "Qtd", price: "Preço", value: "Valor", note: "Nota" },
    },

    confirm: {
      clearTitle: "Tem certeza que deseja limpar a carteira?",
      clearDesc: "Isso limpa a edição atual (tela). Não exclui a carteira do banco.",
      deleteTitle: "Excluir carteira do banco?",
      deleteDesc: "Essa ação remove a carteira e todas as posições/import_runs no banco. Não pode ser desfeita.",
    },
  },

  rebalance: {
    title: "Portfolio Rebalancer",
    subtitle: "B3 XLSX → trades + relatório",

    import: {
      label: "Importar carteira",
      importedFromFile: "Importado de arquivo",
      selectDbPlaceholder: "Selecione uma carteira do banco…",
      fileBtn: "Importar arquivo",
      fileBtnTitle: "Importar XLSX da B3",

      source: "Fonte",
      sourceFile: "Arquivo",
      sourceDb: "Banco",
      file: "Arquivo",

      hint: "• Selecionar uma carteira do banco importa automaticamente. • Importar arquivo abre o seletor e importa automaticamente.",

      titleWhenFile: "Importado de arquivo (use o dropdown para selecionar uma carteira do banco).",
      titleWhenDb: "Selecione uma carteira do banco para importar automaticamente.",
      fileChipTitle: "Você importou via arquivo. Para voltar ao banco, selecione uma carteira no dropdown.",

      remove: "Remover",
      none: "—",
    },

    target: {
      title: "Alocação alvo",
      remaining: "Restante",
    },

    controls: {
      cash: "Cash",
      mode: "Modo",
    },

    modes: {
      trade: "TRADE",
      buy: "BUY",
      sell: "SELL",
    },

    run: {
      run: "Rodar rebalance",
      running: "Rodando",
      runBtn: "Rodar rebalance",
      runningBtn: "Rodando",
    },

    errors: {
      weightsMustBe100: "A soma dos sliders deve ser 100% para calcular.",
      calcErrorTitle: "Erro do cálculo",
    },

    summary: {
      title: "Resumo",
    },

    tables: {
      beforeTitle: "Antes do rebalance",
      afterTitle: "Depois do rebalance",

      ticker: "Ticker",
      qty: "Qtd",
      price: "Preço",
      value: "Valor",
      action: "Ação",

      empty: "Sem dados.",
      breakdownBefore: "Distribuição (antes)",
      breakdownAfter: "Distribuição (depois)",
    },

    allocation: {
      stocks: "Ações",
      fiis: "FIIs",
      bonds: "Tesouro / RF",
    },

    trades: {
      title: "Trades",
    },
    common: {
        total: "Total",
    },
    breakdown: {
        before: "Distribuição (antes)",
        after: "Distribuição (depois)",
    },
    hint: {
      tablesDependOn: "⚠️ As tabelas dependem do backend retornar",
      holdingsBefore: "holdings_before",
      holdingsAfter: "holdings_after",
    },
  },
};


export const dictionaries: Record<Lang, Dict> = {
  "pt-BR": ptBR,
  en,
};

/**
 * Simple + safe key typing (no deep recursion).
 * It gives you: TranslationKey = keyof flat map, generated at runtime.
 */
function flattenKeys(obj: unknown, prefix = ""): string[] {
  if (!obj || typeof obj !== "object") return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.push(p);
    else out.push(...flattenKeys(v, p));
  }
  return out;
}

export const TRANSLATION_KEYS = flattenKeys(en) as readonly string[];
export type TranslationKey = (typeof TRANSLATION_KEYS)[number];
