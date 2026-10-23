/* =====================================================================
   DEFEMA · carregar-produtos.js
   Busca o catálogo no Supabase e devolve no MESMO formato que o site usa:
     { PRODUTOS, DEPS, DEP_INFO }
   - Sem biblioteca: só fetch na API REST do Supabase (/rest/v1/...).
   - Script clássico (funciona com <script src> e também colado inline
     no build standalone). Não usa import/export.
   - Usa SÓ a chave "anon" (pública). NUNCA coloque a service_role aqui.

   API (fica global em window):
     carregarCatalogo({ url, anonKey, fallback, timeoutMs, onAtualizar })
        → Promise<{ PRODUTOS, DEPS, DEP_INFO, origem, erro? }>
          origem: "supabase" | "cache" | "embutido". Nunca rejeita.
     lerCatalogoCache({ url })      → cópia salva no aparelho ou null (síncrono)
     assinaturaCatalogo(dados)      → texto para comparar se o catálogo mudou
     DefemaCatalogo                 → objeto com tudo acima + funções internas

   Estratégia "stale-while-revalidate":
     1) Se há cópia no localStorage: devolve a cópia NA HORA e, em segundo
        plano, busca no Supabase. Se o que chegou for diferente, salva e
        chama onAtualizar(novosDados).
     2) Se não há cópia: espera o Supabase (até timeoutMs, padrão 6 s).
        Deu certo → salva e devolve. Falhou → devolve o `fallback`
        (os produtos embutidos no próprio site).
   ===================================================================== */
(function (raiz) {
  "use strict";

  var VERSAO_CACHE = 1;                 // mude se o formato salvo mudar
  var PREFIXO_CACHE = "defema-catalogo:";
  var BUCKET = "produtos";              // bucket público das fotos
  var TIMEOUT_PADRAO = 6000;            // ms

  /* Consulta principal: produtos ativos + opções + subcategoria/departamento */
  var SELECT_PRODUTOS =
    "*,produto_opcoes(nome,ordem),subcategorias(nome,ordem,departamentos(nome,info,ordem))";
  /* Consulta de apoio: lista completa de departamentos/subcategorias (ordem e textos) */
  var SELECT_DEPS = "nome,info,ordem,subcategorias(nome,ordem)";

  /* ---------------- utilidades ---------------- */
  function semBarraFinal(u) { return String(u || "").replace(/\/+$/, ""); }
  function numero(v) { return v === null || v === undefined || v === "" ? null : Number(v); }
  function porOrdem(a, b) { return (a.ordem || 0) - (b.ordem || 0); }
  function aviso(msg, e) {
    try { if (raiz.console) raiz.console.warn("[Defema] " + msg, e && e.message || e || ""); } catch (_) {}
  }

  /** URL pública da foto no Storage. Aceita "arquivo.jpg", "produtos/arquivo.jpg" ou URL pronta. */
  function urlFoto(url, caminho) {
    if (!caminho) return null;
    if (/^(https?:|data:|blob:)/i.test(caminho)) return caminho;
    // fotos guardadas no próprio site (pasta img/ do GitHub Pages): caminho relativo à página
    if (/^img\//i.test(caminho)) return caminho;
    var c = String(caminho).replace(/^\/+/, "");
    if (c.indexOf(BUCKET + "/") === 0) c = c.slice(BUCKET.length + 1);
    return semBarraFinal(url) + "/storage/v1/object/public/" + BUCKET + "/" +
      c.split("/").map(encodeURIComponent).join("/");
  }

  /* ---------------- conversão banco → formato do site ---------------- */

  /** Uma linha de "produtos" (com embeds) → objeto igual aos do array PRODUTOS do site.
   *  Campos falsos/vazios são omitidos, como no site; preco fica null = "Consultar preço". */
  function produtoParaSite(linha, url) {
    var s = linha.subcategorias || {};
    var d = s.departamentos || {};
    var p = { nome: linha.nome };
    if (linha.marca) p.marca = linha.marca;
    p.dep = d.nome || "";
    p.sub = s.nome || "";
    p.un = linha.unidade || "";
    p.preco = numero(linha.preco);
    var antigo = numero(linha.preco_antigo);
    if (antigo !== null) p.antigo = antigo;
    // mudas de bandeja: preço da bandeja fechada (encomenda); preco = preço por muda
    if ("preco_bandeja" in linha) p.precoBandeja = numero(linha.preco_bandeja);
    if (linha.destaque) p.top = true;
    if (linha.novidade) p.novo = true;
    // "foto_url" é a coluna do contrato; "foto_path" é o nome antigo (bancos de versão anterior)
    var foto = urlFoto(url, linha.foto_url != null ? linha.foto_url : linha.foto_path);
    if (foto) p.foto = foto;
    // fotos a mais (carrossel na página do produto)
    var extras = (linha.fotos_extras || []).map(function (c) { return urlFoto(url, c); }).filter(Boolean);
    if (extras.length) p.fotosExtras = extras;
    if (linha.ilustracao) p.ilu = linha.ilustracao;
    if (linha.icone) p.icone = linha.icone;
    if (linha.restrito) p.restrito = true;
    if (linha.por_metro) p.porMetro = true;
    var opcoes = (linha.produto_opcoes || []).slice().sort(porOrdem)
      .map(function (o) { return o.nome; });
    if (opcoes.length) {                 // sem opções → campo omitido (como no site)
      p.opcoes = opcoes;
      p.opNome = linha.op_nome || "Opção";
    }
    p.descricao = linha.descricao || ""; // "" → o site usa as descrições automáticas
    return p;
  }

  /**
   * Monta { PRODUTOS, DEPS, DEP_INFO }.
   * @param linhasProdutos resposta de produtos?select=SELECT_PRODUTOS
   * @param linhasDeps     resposta de departamentos?select=SELECT_DEPS (pode ser null)
   */
  function montarCatalogo(linhasProdutos, linhasDeps, url) {
    var DEPS = {}, DEP_INFO = {};

    // 1) Departamentos/subcategorias na ordem definida no painel
    (linhasDeps || []).slice().sort(porOrdem).forEach(function (d) {
      DEPS[d.nome] = (d.subcategorias || []).slice().sort(porOrdem)
        .map(function (s) { return s.nome; });
      DEP_INFO[d.nome] = d.info || "";
    });

    // 2) Produtos ativos (o RLS já esconde os inativos; o filtro aqui é só garantia)
    var linhas = (linhasProdutos || [])
      .map(function (l, i) { return { l: l, i: i }; })
      .filter(function (x) { return x.l.ativo !== false && x.l.subcategorias && x.l.subcategorias.departamentos; })
      .sort(function (a, b) { return porOrdem(a.l, b.l) || a.i - b.i; }); // empate: ordem recebida

    // 3) Se a consulta de departamentos falhou (ou falta algo), completa pelos produtos
    linhas.forEach(function (x) {
      var s = x.l.subcategorias, d = s.departamentos;
      if (!DEPS[d.nome]) { DEPS[d.nome] = []; DEP_INFO[d.nome] = d.info || ""; }
      if (DEPS[d.nome].indexOf(s.nome) < 0) DEPS[d.nome].push(s.nome);
    });

    var PRODUTOS = linhas.map(function (x) { return produtoParaSite(x.l, url); });
    PRODUTOS.forEach(function (p, i) { p.id = i; }); // igual ao site: id = posição no array
    return { PRODUTOS: PRODUTOS, DEPS: DEPS, DEP_INFO: DEP_INFO };
  }

  /** Texto que identifica o conteúdo (ignora id e campos de controle). */
  function assinaturaCatalogo(d) {
    if (!d) return "";
    return JSON.stringify([
      (d.PRODUTOS || []).map(function (p) {
        var c = {}; for (var k in p) if (k !== "id") c[k] = p[k]; return c;
      }),
      d.DEPS || {}, d.DEP_INFO || {}, d.CONFIG || {}
    ]);
  }

  /* ---------------- cache no localStorage (sempre com try/catch) ---------------- */
  function chaveCache(url) { return PREFIXO_CACHE + semBarraFinal(url); }

  /** Lê a cópia salva. Síncrono. Devolve null se não houver, estiver corrompida
   *  ou o navegador bloquear o armazenamento (aba anônima etc.). */
  function lerCatalogoCache(op) {
    try {
      var c = JSON.parse(raiz.localStorage.getItem(chaveCache(op && op.url)) || "null");
      if (!c || c.v !== VERSAO_CACHE || !Array.isArray(c.PRODUTOS) || !c.PRODUTOS.length || !c.DEPS) return null;
      return { PRODUTOS: c.PRODUTOS, DEPS: c.DEPS, DEP_INFO: c.DEP_INFO || {}, CONFIG: c.CONFIG || {}, salvoEm: c.salvoEm };
    } catch (_) { return null; }
  }
  function salvarCache(url, d) {
    try {
      raiz.localStorage.setItem(chaveCache(url), JSON.stringify({
        v: VERSAO_CACHE, salvoEm: Date.now(), PRODUTOS: d.PRODUTOS, DEPS: d.DEPS, DEP_INFO: d.DEP_INFO, CONFIG: d.CONFIG || {}
      }));
    } catch (_) { /* cheio ou bloqueado: segue sem cache */ }
  }

  /* ---------------- rede ---------------- */
  function getJson(endereco, anonKey, sinal) {
    var cab = { apikey: anonKey, Accept: "application/json" };
    // Chave "anon" clássica é um JWT (começa com "eyJ") e vai também no Authorization.
    // A chave nova "sb_publishable_..." não é JWT: vai só no apikey (o Supabase aplica o papel anon).
    if (/^eyJ/.test(anonKey)) cab.Authorization = "Bearer " + anonKey;
    return fetch(endereco, { headers: cab, signal: sinal }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status + " em " + endereco.split("?")[0]);
      return r.json();
    });
  }

  /** Busca as duas consultas em paralelo, com limite de tempo. Rejeita em erro. */
  function buscarDoSupabase(url, anonKey, timeoutMs) {
    var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var sinal = ctl ? ctl.signal : undefined;
    var timer;
    var tempo = new Promise(function (_, rejeita) {
      timer = setTimeout(function () {
        if (ctl) ctl.abort();
        rejeita(new Error("tempo esgotado (" + timeoutMs + " ms)"));
      }, timeoutMs);
    });
    var rest = url + "/rest/v1/";
    var pProdutos = getJson(rest + "produtos?select=" + encodeURIComponent(SELECT_PRODUTOS) +
      "&ativo=eq.true&order=ordem.asc", anonKey, sinal);
    // departamentos é "bônus": se falhar, os DEPS saem dos próprios produtos
    var pDeps = getJson(rest + "departamentos?select=" + encodeURIComponent(SELECT_DEPS) +
      "&order=ordem.asc", anonKey, sinal).catch(function () { return null; });

    // configurações do site (carrossel etc.): também "bônus" — sem a tabela, o site usa o automático
    var pCfg = getJson(rest + "site_config?select=chave,valor", anonKey, sinal).catch(function () { return null; });

    return Promise.race([Promise.all([pProdutos, pDeps, pCfg]), tempo])
      .then(function (r) {
        if (!Array.isArray(r[0])) throw new Error("resposta inesperada do Supabase");
        var dados = montarCatalogo(r[0], Array.isArray(r[1]) ? r[1] : null, url);
        dados.CONFIG = {};
        (Array.isArray(r[2]) ? r[2] : []).forEach(function (c) { if (c && c.chave) dados.CONFIG[c.chave] = c.valor || {}; });
        // catálogo vazio quase sempre é configuração errada (RLS, chave): não apaga o site
        if (!dados.PRODUTOS.length) throw new Error("catálogo vazio no Supabase");
        return dados;
      })
      .finally(function () { clearTimeout(timer); });
  }

  /* ---------------- função principal ---------------- */
  function comOrigem(d, origem, erro) {
    var r = { PRODUTOS: d.PRODUTOS, DEPS: d.DEPS, DEP_INFO: d.DEP_INFO, CONFIG: d.CONFIG || {}, origem: origem };
    if (erro) r.erro = erro;
    return r;
  }

  /**
   * Carrega o catálogo. Nunca rejeita.
   * @param {object} op
   * @param {string}   op.url          Project URL do Supabase (https://xxxx.supabase.co)
   * @param {string}   op.anonKey      chave anon (pública)
   * @param {object}   op.fallback     { PRODUTOS, DEPS, DEP_INFO } embutidos no site
   * @param {number}  [op.timeoutMs]   limite de espera (padrão 6000)
   * @param {function}[op.onAtualizar] chamada quando a revalidação em segundo plano traz dados novos
   */
  async function carregarCatalogo(op) {
    op = op || {};
    var url = semBarraFinal(op.url);
    var timeoutMs = op.timeoutMs == null ? TIMEOUT_PADRAO : op.timeoutMs;
    var fallback = op.fallback || { PRODUTOS: [], DEPS: {}, DEP_INFO: {} };

    if (!url || !op.anonKey || typeof fetch !== "function") {
      return comOrigem(fallback, "embutido", "Supabase não configurado");
    }

    var cache = lerCatalogoCache({ url: url });
    var rede = buscarDoSupabase(url, op.anonKey, timeoutMs);

    if (cache) {
      // stale-while-revalidate: responde já com a cópia e atualiza por trás
      rede.then(function (novo) {
        salvarCache(url, novo);
        if (assinaturaCatalogo(novo) !== assinaturaCatalogo(cache) && typeof op.onAtualizar === "function") {
          try { op.onAtualizar(comOrigem(novo, "supabase")); } catch (e) { aviso("erro em onAtualizar:", e); }
        }
      }, function (e) { aviso("não foi possível atualizar o catálogo:", e); });
      return comOrigem(cache, "cache");
    }

    try {
      var dados = await rede;
      salvarCache(url, dados);
      return comOrigem(dados, "supabase");
    } catch (e) {
      aviso("catálogo do Supabase indisponível, usando o embutido:", e);
      return comOrigem(fallback, "embutido", String(e && e.message || e));
    }
  }

  /* ---------------- exporta ---------------- */
  var api = {
    carregarCatalogo: carregarCatalogo,
    lerCatalogoCache: lerCatalogoCache,
    assinaturaCatalogo: assinaturaCatalogo,
    montarCatalogo: montarCatalogo,
    produtoParaSite: produtoParaSite,
    urlFoto: urlFoto,
    chaveCache: chaveCache
  };
  raiz.DefemaCatalogo = api;
  raiz.carregarCatalogo = carregarCatalogo;
  raiz.lerCatalogoCache = lerCatalogoCache;
  raiz.assinaturaCatalogo = assinaturaCatalogo;
  if (typeof module === "object" && module && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
