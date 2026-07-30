# Rapport de problèmes — Weppy/NovaMCP + session Studio

**Date** : 2026-07-30
**Environnement** :
- Serveur MCP : `C:\Users\lulul\weppy-roblox-mcp` — fork `@walynde-arch/novamcp` **v2.11.3** (AGPL-3.0, merge upstream hope1026 v2.11.3 le 2026-07-31), lancé via `start-mcp.bat` → `node dist\index.js` (bundle unique 2,2 Mo). Patch Hermes Agent detection réappliqué.
- Plugin Studio installé : `WeppyRobloxMCP.rbxm` (compilé — pas de source Lua dans le repo, dossier `roblox-plugin/` = binaire seulement).
- Studio : place `108926365638377` (« Hauts-de-France », fichier Place1), clientId session `cc92fff9-10f0-490c-af11-a0cad01afc27`, alias `studio-1`.
- Deux Studios ont été connectés simultanément plus tôt (studio-2 = « MAP MRS.rbxl », lecture seule).

---

## 1. BUG MAJEUR — écritures scripts visibles dans Studio mais non exécutées au play (F5)

**Symptôme** : les modifications de scripts faites via le MCP (`manage_scripts set_source` / `edit_insert` / `edit_replace`, et `mutate_instances create` + `set_source`) sont :
- ✅ visibles dans le read-back MCP (`get_source`),
- ✅ visibles dans l'Explorer Studio **et** dans l'éditeur de scripts de Studio (vérifié visuellement par l'utilisateur),
- ❌ **jamais exécutées au play** : F5 compile et exécute la source d'avant les modifications.

### Preuves

**Test PROBE3** (le plus décisif) :
1. Insertion via `edit_insert` (afterLine 6) d'un bloc `PROBE3` en tête de `SettingHandler` (Script qui tourne à chaque boot — il imprime `--- Fin de l'initialisation du script Réglages v3.3.0 ---` à chaque play).
2. Read-back : OK, 17 lignes insérées, total 108 lignes.
3. Play : la ligne finale habituelle de SettingHandler s'imprime normalement ; **les prints inconditionnels de PROBE3 (placés AVANT tout le reste du script) ne s'impriment jamais**. Même pipeline de sortie, même script → la source compilée était l'ancienne.

**Test script neuf** :
1. `mutate_instances create` Script `BootCheck_02` dans ServerScriptService + `set_source` → `print("[BOOTCHK2] innocent name executes")`.
2. L'utilisateur voit le script dans l'Explorer et le print dans l'éditeur.
3. Plusieurs boots : aucune occurrence de `[BOOTCHK2]` dans les logs, alors que des scripts intouchés (SettingHandler, PhoneServerHandler, Bloxender, EpicLights) s'exécutent normalement.

**Symptôme côté jeu** : `ServiceLoader` (bootstrap de tous les services éco) muet → `leaderstats` jamais créés → warnings `Infinite yield possible on 'Players.X:WaitForChild("leaderstats")'` à chaque boot.

**Contre-exemple historique** : le même `ServiceLoader` tournait parfaitement à 19h32 le même jour (log complet avec `🔄 [ServiceLoader] Démarrage des services...`, `OK [TrunkService]`, toute la chaîne `✅ Chargé : ...`). Le problème est apparu après un crash de Studio en cours de session (voir §2).

### Ce qui est écarté
- **Routage multi-Studio** : `execute_luau` avec sélecteur `placeId: 108926365638377` renvoie bien `game.PlaceId == 108926365638377`, `game.Name == "Hauts-de-France"`, `BootCheck_02` présent, rename correct — la vue du plugin est le bon DataModel.
- **Blacklist StudioGuardPro** : le nom `ServiceLoader` s'exécutait à 19h32 ; un rename vers `DemarrageServices` n'a rien changé.
- **RunContext / Disabled** : scripts créés avec `Disabled: false`, RunContext Legacy par défaut, dans ServerScriptService.
- **Capture de logs** : `manage_logs` capture bien la vraie sortie (les prints des scripts intouchés et les warnings client y figurent).

### Zone d'incertitude restante
Un redémarrage complet avec **mise à mort des processus zombies** (`RobloxStudio.exe` au Task Manager) + Ctrl+S + F5 manuel n'a pas encore été confirmé par l'utilisateur. Si une session zombie survit au « redémarrage », elle peut mimer ce bug. Test discriminant en attente :
- Ctrl+S → tuer tous les `RobloxStudio.exe` → rouvrir → **F5 manuel** → Output.
- Si `[BOOTCHK2]` + `🔄 [ServiceLoader]` apparaissent → le bug est plutôt du côté du pipeline `play_start`/`manage_logs` piloté par le MCP.
- Si toujours muet → la voie d'écriture `Source` du plugin est défectueuse (comparaison : les plugins type Rojo écrivent `Script.Source` et F5 reflète le changement sans sauvegarde).

---

## 2. Crash Studio + désync de vue DM (début de la saga)

- Crash de l'instance studio-1 pendant une session de travail (écritures scripts + mutations d'instances nombreuses).
- Après crash + reconnect MCP : les écritures apparaissaient dans la vue plugin mais pas dans Studio ; des scripts de test ne s'exécutaient pas.
- Résolu (apparemment) par : Ctrl+S → fermeture complète de Studio → réouverture → reconnect `/mcp`. La persistance dans le DM post-restart a été confirmée par relecture.
- **Mais** le bug §1 a persisté après ce cycle — d'où le soupçon soit de processus zombie, soit de bug plugin distinct.

---

## 3. Routage multi-Studio : alias réassignés à chaque reconnect

- `targetAlias` (`studio-1`/`studio-2`) est **réassigné à chaque reconnect MCP** : l'alias qui pointait vers le bon Studio peut pointer vers l'autre après un `/mcp`.
- Contournement systématique : passer **`placeId` à chaque appel** (le sélecteur placeId, lui, est fiable et confirmé dans les réponses `routing`).
- Suggestion : rendre l'alias stable (bind sur placeId ou nom de fichier) ou afficher clairement le bind dans le Dashboard.

---

## 4. Frictions API des outils MCP

| Outil | Problème | Contournement |
|---|---|---|
| `manage_scripts edit_insert` | paramètre `newLines` refusé (« Parameter 'newLines' is not used by action 'edit_insert' ») alors que le nom est intuitif ; il faut utiliser `lines`/`content` | utiliser `lines` |
| `manage_scripts create` | le champ `source` fourni à la création n'est pas appliqué de façon fiable | `create` puis `set_source` séparément |
| `manage_scripts search` | les patterns ne peuvent pas contenir d'accents (é/è/à) — gênant sur un projet entièrement en français | chercher des repères ASCII |
| `execute_luau` | lit uniquement le DataModel **Edit**, jamais le runtime play ; aucun outil d'éval serveur live → impossible d'inspecter l'état des scripts *pendant* un play (ex. vérifier si un script est Disabled au runtime) | logs + déduction |
| `manage_properties` | nommage confus entre `get`/`mass_get`/`set_multiple`/`mass_set` — « get_multiple » n'existe pas | `mass_get` |

---

## 5. Logs & observabilité

- **Mode Run (F8)** via `play_start mode: run` : buffer de logs **figé** (plus rien ne remonte après quelques secondes). Le mode Play (F5) fonctionne normalement.
- Le flux de logs **s'arrête parfois ~15 s après le boot** même si le jeu continue (buffer max 500 entrées) — curseur `sinceSeq` nécessaire pour ne rien perdre.
- **Logs serveur** : `logs/weppy-2026-07-*.log` s'arrêtent au **2026-07-25** alors que des sessions actives ont eu lieu le 2026-07-30 → soit la rotation/le chemin a changé, soit le logging est cassé dans cette version.
- **Cache de lecture** (`cache.cjs`, TTL 5 min ; LRU place cache d'après le CHANGELOG) : peut servir des read-backs `get_source` périmés après une session switch. Un read-back ne devrait jamais être servi du cache juste après une écriture du même serveur.

---

## 6. Bug connu du fork (trouvé dans le repo)

`validate-edit.cjs` (outil de validation manuel, non branché automatiquement) documente en en-tête :
> « Prevents the **silent duplication/corruption bug on large scripts** » (edit_replace).

Ce garde-fou existe mais n'est pas appliqué d'office par le serveur — les éditions sur gros scripts (1000+ lignes, ex. SpawnerHandler 1516 lignes) restent exposées.

### Note v2.11.2/v2.11.3 (upstream hope1026, merge 2026-07-31)
- **v2.11.2** : fix récupération index Sync corrompu/tronqué, préservation des types Script/LocalScript en incremental Sync, anti-duplication forward Sync (le plugin ne renvoie plus ses propres écritures mirror comme des edits utilisateur). Ces 3 fixes réduisent les vecteurs de désync post-crash mais ne corrigent PAS directement le bug §1 (écritures non exécutées au play).
- **v2.11.3** : Dashboard UI uniquement (storage controls, cleanup labels). Aucun changement serveur/plugin côté écriture Source.

---

## 7. Bruit d'autres plugins (contexte, pas Weppy)

- **StudioGuardPro** : imprime « Real-time protection active — 12 blacklisted names, 5 asset IDs » à chaque boot puis erroe en boucle : `StudioGuardPro is not a valid member of Workspace` (pile : `sgpQuarantine` L1493, `sgpLiveScan` L1522/L1526 de `user_StudioGuardPro.rbxmx`). Son propre mécanisme de quarantaine est cassé.
- **MCPPlugin.rbxmx** (robloxstudio-mcp, autre plugin) : warnings `[robloxstudio-mcp] /ready failed ... HttpError: ConnectFail` sur `localhost:58741` — plugin hors ligne, bruit pur.

---

## 8. Erreurs pré-existantes du jeu (contexte, pas MCP)

- `DataStoreService` : `TooManyRequests` sur `PlayerInbox_V1` au join.
- « L'expérience n'a pas le droit d'utiliser l'identifiant 85899452190207 » (asset non autorisé).
- Police `GothamBold.json failed to load: Temp read failed`.
- Icônes : `Failed to load icons source from the web` (HTTP 404).
- Adonis : `Timer is not a valid member of Frame ... Config.Notification` (module Notification nil).

---

## Repro minimale (documentation interne / issue upstream hope1026)

1. Session MCP active, deux Studios connectés, travail d'édition intensif → crash d'une instance.
2. Reconnect, puis n'importe quel `edit_insert`/`set_source` sur un Script serveur qui imprime au boot.
3. Read-back OK, éditeur Studio OK, play → l'ancien code s'exécute.
4. Ctrl+S + F5 : idem (à re-confirmer avec kill complet des processus).

**Actions** : inspecter la voie d'écriture `Script.Source` et l'invalidation du cache de compilation dans le plugin (source .luau disponible via Script Sync) ; stabilisation des alias multi-Studio ; logs serveur à réparer. Si le bug est confirmé côté plugin, ouvrir une issue upstream sur hope1026/weppy-roblox-mcp.
