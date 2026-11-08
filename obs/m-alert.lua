--[[
M-Alert pour OBS Studio : incrustation des alertes (alerte sismique précoce, tsunami, météo…)
façon NHK, en temps réel depuis le serveur M-Alert.

Installation : OBS > Outils > Scripts > « + » > ce fichier (m-alert.lua). Choisissez la scène,
réglez les options puis « Ajouter / mettre à jour l'incrustation ». Le script crée (ou met à
jour) une source navigateur « M-Alert » de 1920 × 1080, fond transparent, dont le son passe par
OBS. La source affiche :
  - le bandeau d'alerte (carte à gauche, titre, consigne, lieux) quand une alerte arrive ;
  - la carte des côtes en alerte tsunami, qui clignotent, tant qu'un tsunami est en cours ;
  - le cadre « Information(s) M-Alert » : alerte annulée, notifications envoyées depuis M-Alert-sender.
Écran réduit (option) : 10 secondes (réglable) après l'arrivée d'une alerte, OBS passe sur la scène « M-Alert (alerte) » : fond bleu,
« Informations M-Alert » puis les informations en haut, la scène en cours réduite à 80 % et le
bandeau en bas ; puis OBS revient à la scène d'avant. Aussi à la main : bouton « Écran réduit :
activer / désactiver » ou raccourci clavier (Paramètres > Raccourcis clavier > « M-Alert : écran réduit »).
À la main aussi : texte en haut seul (source « M-Alert (texte) », cachée au départ, sans réduire
l'image) et bandeau de l'alerte en cours (affiché ou masqué), par bouton ou raccourci clavier.
]]

obs = obslua

local SOURCE_NAME = "M-Alert"
-- Version de la page (adresse changée à chaque version : OBS ne garde pas l'ancienne en cache).
local PAGE_VERSION = "3.0.1-13"
local DEFAULT_BASE = "https://malik05051.github.io/M-Alert/obs/"
-- Écran réduit (comme la NHK) : scène où OBS passe pendant une alerte, et sa source de fond.
local ALERT_SCENE = "M-Alert (alerte)"
local FOND_NAME = "M-Alert (fond)"
local REDUCED_SCALE = 0.8   -- image du direct réduite à 80 %
local REDUCED_Y = 196       -- sous le texte d'informations (canevas 1920 × 1080)
local ANIM_MS = 500
-- Catégories des alertes M-Alert (comme dans l'application).
local CATEGORIES = { "seisme", "tsunami", "meteo", "pollution", "accident", "attentat", "greve", "blocus", "missile" }
local settings_ref = nil

local function urlencode(s)
  return (tostring(s):gsub("[^%w%-%._~]", function(c) return string.format("%%%02X", string.byte(c)) end))
end

local function overlay_url(st, demo)
  local base = obs.obs_data_get_string(st, "base")
  if base == "" then base = DEFAULT_BASE end
  local params = {}
  local function add(k, v) if v ~= nil and v ~= "" then table.insert(params, k .. "=" .. urlencode(v)) end end
  -- Aperçu : exemple sans serveur, avec la position et la largeur choisies.
  add("demo", demo)
  add("server", obs.obs_data_get_string(st, "server"))
  local types = {}
  for _, t in ipairs(CATEGORIES) do
    if obs.obs_data_get_bool(st, "type_" .. t) then table.insert(types, t) end
  end
  if #types < #CATEGORIES then add("types", table.concat(types, ",")) end
  add("deps", obs.obs_data_get_string(st, "deps"))
  add("min", tostring(obs.obs_data_get_int(st, "min")))
  -- Aperçu : 20 secondes (écran réduit compris), puis retour à la scène.
  add("hold", demo and "20" or tostring(obs.obs_data_get_int(st, "hold")))
  add("cancelHold", tostring(obs.obs_data_get_int(st, "cancel_hold")))
  add("addedSeconds", tostring(obs.obs_data_get_int(st, "added_seconds")))
  if not obs.obs_data_get_bool(st, "stay") then add("stay", "0") end
  add("cardSeconds", demo and "8" or tostring(obs.obs_data_get_int(st, "card_seconds")))
  add("mapSeconds", demo and "8" or tostring(obs.obs_data_get_int(st, "map_seconds")))
  if obs.obs_data_get_bool(st, "reduce") then add("reduce", ALERT_SCENE) end
  -- Délai de l'écran réduit, ou du texte en haut seul (sans écran réduit).
  add("reduceAfter", demo and "3" or tostring(obs.obs_data_get_int(st, "reduce_after")))
  if obs.obs_data_get_bool(st, "sound") then add("sound", "1") end
  if not obs.obs_data_get_bool(st, "tests") then add("tests", "0") end
  if not obs.obs_data_get_bool(st, "tsunami") then add("tsunami", "0") end
  if not obs.obs_data_get_bool(st, "infos") then add("infos", "0") end
  if obs.obs_data_get_bool(st, "top") then add("pos", "top") end
  local width = obs.obs_data_get_int(st, "width")
  if width < 30 or width > 100 then width = 66 end
  add("width", tostring(width))
  add("v", PAGE_VERSION)
  local q = table.concat(params, "&")
  return base .. (base:find("?", 1, true) and "&" or "?") .. q
end

-- Source navigateur de l'incrustation : celle nommée SOURCE_NAME si c'en est bien une (une scène
-- ou une autre source peut porter ce nom), sinon SOURCE_NAME .. " (incrustation)".
local function find_overlay()
  for _, name in ipairs({ SOURCE_NAME, SOURCE_NAME .. " (incrustation)" }) do
    local src = obs.obs_get_source_by_name(name)
    if src ~= nil then
      if obs.obs_source_get_unversioned_id(src) == "browser_source" then return src, name end
      obs.obs_source_release(src)
    else
      return nil, name
    end
  end
  return nil, SOURCE_NAME .. " (incrustation M-Alert)"
end

local function browser_available()
  return obs.obs_source_get_display_name("browser_source") ~= nil
end


local function browser_data(url, control)
  local data = obs.obs_data_create()
  obs.obs_data_set_string(data, "url", url)
  obs.obs_data_set_bool(data, "is_local_file", false)
  obs.obs_data_set_int(data, "width", 1920)
  obs.obs_data_set_int(data, "height", 1080)
  obs.obs_data_set_bool(data, "reroute_audio", true)
  obs.obs_data_set_bool(data, "shutdown", false)
  obs.obs_data_set_bool(data, "restart_when_active", false)
  -- Accès « avancé » à OBS : la page passe sur la scène de l'écran réduit et revient.
  if control then obs.obs_data_set_int(data, "webpage_control_level", 4) end
  obs.obs_data_set_string(data, "css", "body { background-color: rgba(0, 0, 0, 0); margin: 0px auto; overflow: hidden; }")
  return data
end

-- Source navigateur par nom (créée ou mise à jour), avec une référence à relâcher.
local function upsert_browser(name, data)
  local src = obs.obs_get_source_by_name(name)
  if src ~= nil then obs.obs_source_update(src, data) else src = obs.obs_source_create("browser_source", name, data, nil) end
  return src
end

local function scene_by_name(name)
  local src = obs.obs_get_source_by_name(name)
  if src == nil then return nil end
  local scene = obs.obs_scene_from_source(src)
  obs.obs_source_release(src)
  return scene
end

local overlay_name = nil   -- nom de la source de l'incrustation
local program_scene = nil  -- scène réduite pendant l'alerte (celle d'avant)
local hidden_in = nil      -- scène où l'incrustation est masquée pendant l'écran réduit
local text_hidden_in = nil -- scène où le texte en haut seul est masqué pendant l'écran réduit
local anim = nil

-- Scène de l'écran réduit : fond (bleu et texte), puis la scène d'avant (ajoutée à l'alerte), puis
-- l'incrustation (bandeau) au premier plan.
local function ensure_alert_scene(st, demo)
  local scene = scene_by_name(ALERT_SCENE)
  if scene == nil then
    local created = obs.obs_scene_create(ALERT_SCENE)
    scene = created
    obs.script_log(obs.LOG_INFO, "M-Alert : scène « " .. ALERT_SCENE .. " » créée (écran réduit)")
  end
  local data = browser_data(overlay_url(st, demo) .. "&layer=fond", false)
  local fond = upsert_browser(FOND_NAME, data)
  obs.obs_data_release(data)
  if fond ~= nil then
    local item = obs.obs_scene_find_source(scene, FOND_NAME)
    if item == nil then item = obs.obs_scene_add(scene, fond) end
    if item ~= nil then obs.obs_sceneitem_set_order(item, obs.OBS_ORDER_MOVE_BOTTOM) end
    obs.obs_source_release(fond)
  end
  local ov = obs.obs_get_source_by_name(overlay_name)
  if ov ~= nil then
    local item = obs.obs_scene_find_source(scene, overlay_name)
    if item == nil then item = obs.obs_scene_add(scene, ov) end
    if item ~= nil then obs.obs_sceneitem_set_visible(item, true); obs.obs_sceneitem_set_order(item, obs.OBS_ORDER_MOVE_TOP) end
    obs.obs_source_release(ov)
  end
end

local function set_xform(item, k)
  local scale = 1 - (1 - REDUCED_SCALE) * k
  local pos = obs.vec2()
  pos.x = (1920 - 1920 * scale) / 2
  pos.y = REDUCED_Y * k -- haut de l'image : de 0 à REDUCED_Y
  local sc = obs.vec2()
  sc.x = scale
  sc.y = scale
  obs.obs_sceneitem_set_pos(item, pos)
  obs.obs_sceneitem_set_scale(item, sc)
end

local function anim_tick()
  if anim == nil then obs.timer_remove(anim_tick) return end
  local t = math.min(1, (obs.os_gettime_ns() - anim.start) / (ANIM_MS * 1e6))
  local k = 1 - (1 - t) * (1 - t)
  local scene = scene_by_name(ALERT_SCENE)
  local item = scene and anim.name and obs.obs_scene_find_source(scene, anim.name)
  if item ~= nil and item then set_xform(item, k) end
  if t >= 1 then anim = nil; obs.timer_remove(anim_tick) end
end

-- Incrustation dans une scène, aussi dans ses groupes.
local function find_overlay_item(scene)
  if scene == nil or overlay_name == nil then return nil end
  local find = obs.obs_scene_find_source_recursive or obs.obs_scene_find_source
  local item = find(scene, overlay_name)
  if item == nil or not item then return nil end
  return item
end

local function set_overlay_visible(scene_name, visible)
  if scene_name == nil then return end
  local item = find_overlay_item(scene_by_name(scene_name))
  if item ~= nil then obs.obs_sceneitem_set_visible(item, visible) end
end

-- Pendant l'écran réduit, l'incrustation reste en grand au premier plan de la scène de l'alerte : elle
-- est masquée dans la scène d'avant et dans les scènes qu'elle contient (sinon elle s'affiche en double,
-- réduite). hidden_list : scènes où elle a été masquée, pour la remettre ensuite.
local hidden_list = {}
local function hide_overlay_in(scene_name, seen)
  seen = seen or {}
  if scene_name == nil or scene_name == ALERT_SCENE or seen[scene_name] then return end
  seen[scene_name] = true
  local scene = scene_by_name(scene_name)
  if scene == nil then return end
  local item = find_overlay_item(scene)
  if item ~= nil and obs.obs_sceneitem_visible(item) then
    obs.obs_sceneitem_set_visible(item, false)
    table.insert(hidden_list, scene_name)
  end
  local items = obs.obs_scene_enum_items(scene)
  if items ~= nil then
    for _, it in ipairs(items) do
      local src = obs.obs_sceneitem_get_source(it)
      if obs.obs_source_get_unversioned_id(src) == "scene" then hide_overlay_in(obs.obs_source_get_name(src), seen) end
    end
    obs.sceneitem_list_release(items)
  end
end
local function restore_overlay()
  for _, name in ipairs(hidden_list) do set_overlay_visible(name, true) end
  hidden_list = {}
end

-- Scène d'avant déjà mise dans la scène de l'écran réduit (OBS ouvert directement sur cette scène).
local function nested_program_scene()
  local scene = scene_by_name(ALERT_SCENE)
  if scene == nil then return nil end
  local found = nil
  local items = obs.obs_scene_enum_items(scene)
  if items ~= nil then
    for _, it in ipairs(items) do
      local src = obs.obs_sceneitem_get_source(it)
      if found == nil and obs.obs_source_get_unversioned_id(src) == "scene" then found = obs.obs_source_get_name(src) end
    end
    obs.sceneitem_list_release(items)
  end
  return found
end

-- OBS est passé sur la scène de l'écran réduit : la scène d'avant y est mise, réduite (animation),
-- et l'incrustation y est masquée (elle reste affichée en grand au premier plan).
local function enter_reduced(no_anim)
  local scene = scene_by_name(ALERT_SCENE)
  if scene ~= nil and program_scene == nil then program_scene = nested_program_scene() end
  if scene == nil or program_scene == nil then return end
  local items = obs.obs_scene_enum_items(scene)
  if items ~= nil then
    for _, it in ipairs(items) do
      local src = obs.obs_sceneitem_get_source(it)
      local id = obs.obs_source_get_unversioned_id(src)
      if id == "scene" and obs.obs_source_get_name(src) ~= program_scene then obs.obs_sceneitem_remove(it) end
    end
    obs.sceneitem_list_release(items)
  end
  local item = obs.obs_scene_find_source(scene, program_scene)
  if item == nil then
    local src = obs.obs_get_source_by_name(program_scene)
    if src ~= nil then item = obs.obs_scene_add(scene, src); obs.obs_source_release(src) end
  end
  if item == nil then return end
  obs.obs_sceneitem_set_visible(item, true)
  -- Ordre : fond, scène réduite, incrustation.
  obs.obs_sceneitem_set_order(item, obs.OBS_ORDER_MOVE_BOTTOM)
  local fond = obs.obs_scene_find_source(scene, FOND_NAME)
  if fond ~= nil then obs.obs_sceneitem_set_order(fond, obs.OBS_ORDER_MOVE_BOTTOM) end
  set_xform(item, no_anim and 1 or 0)
  restore_overlay()
  hide_overlay_in(program_scene)
  hidden_in = program_scene
  -- Texte en haut seul (affiché à la main) : masqué dans la scène réduite (le fond a déjà le texte).
  local ps = scene_by_name(program_scene)
  local ti = ps and obs.obs_scene_find_source(ps, "M-Alert (texte)")
  if ti ~= nil and ti and obs.obs_sceneitem_visible(ti) then
    obs.obs_sceneitem_set_visible(ti, false)
    text_hidden_in = program_scene
  end
  if no_anim then return end
  anim = { start = obs.os_gettime_ns(), name = program_scene }
  obs.timer_remove(anim_tick)
  obs.timer_add(anim_tick, 16)
end

local function on_event(event)
  if event ~= obs.OBS_FRONTEND_EVENT_SCENE_CHANGED then return end
  local cur = obs.obs_frontend_get_current_scene()
  if cur == nil then return end
  local name = obs.obs_source_get_name(cur)
  obs.obs_source_release(cur)
  if name == ALERT_SCENE then
    enter_reduced()
  else
    restore_overlay(); hidden_in = nil
    if text_hidden_in ~= nil then
      local ps = scene_by_name(text_hidden_in)
      local ti = ps and obs.obs_scene_find_source(ps, "M-Alert (texte)")
      if ti ~= nil and ti then obs.obs_sceneitem_set_visible(ti, true) end
      text_hidden_in = nil
    end
    program_scene = name
  end
end

-- Écran réduit à la main (bouton ou raccourci clavier) : passe sur la scène de l'écran réduit, ou
-- revient à la scène d'avant.
local hotkey_id = nil
local function toggle_reduced()
  local cur = obs.obs_frontend_get_current_scene()
  if cur == nil then return end
  local name = obs.obs_source_get_name(cur)
  obs.obs_source_release(cur)
  if name == ALERT_SCENE then
    local back = program_scene and obs.obs_get_source_by_name(program_scene)
    if back ~= nil and back then obs.obs_frontend_set_current_scene(back); obs.obs_source_release(back) end
    return
  end
  program_scene = name
  if scene_by_name(ALERT_SCENE) == nil and settings_ref ~= nil then ensure_alert_scene(settings_ref, nil) end
  local target = obs.obs_get_source_by_name(ALERT_SCENE)
  if target ~= nil then obs.obs_frontend_set_current_scene(target); obs.obs_source_release(target) end
end

-- Calque affiché à la main (bouton ou raccourci clavier), caché au départ : texte en haut seul
-- (sans réduire l'image). Le bandeau, lui, est celui de l'incrustation (commande envoyée à la page).
local OLD_BANNER_SOURCE = "M-Alert (bandeau)" -- ancienne source du bandeau à la main, retirée
local MANUAL = {
  { key = "texte", name = "M-Alert (texte)", label = "Texte en haut : afficher / masquer" },
}
local manual_hotkeys = {}

local function current_program_scene()
  local cur = obs.obs_frontend_get_current_scene()
  if cur == nil then return nil end
  local name = obs.obs_source_get_name(cur)
  obs.obs_source_release(cur)
  if name == ALERT_SCENE and program_scene ~= nil then return program_scene end
  return name
end

-- Sources des calques à jour (adresse), et présentes dans la scène en cours (cachées si ajoutées).
local function ensure_manual(st, demo)
  local scene_name = current_program_scene()
  local scene = scene_name and scene_by_name(scene_name)
  if scene ~= nil and scene then
    local old_item = obs.obs_scene_find_source(scene, OLD_BANNER_SOURCE)
    if old_item ~= nil then obs.obs_sceneitem_remove(old_item) end
  end
  -- Sans l'écran réduit : texte en haut tout seul pendant une alerte (option).
  local auto = not obs.obs_data_get_bool(st, "reduce") and obs.obs_data_get_bool(st, "text_auto")
  for _, m in ipairs(MANUAL) do
    local data = browser_data(overlay_url(st, demo) .. "&layer=" .. m.key .. (auto and "&textAuto=1" or ""), false)
    local src = upsert_browser(m.name, data)
    obs.obs_data_release(data)
    if src ~= nil then
      if scene ~= nil and scene then
        local item = obs.obs_scene_find_source(scene, m.name)
        if item == nil then item = obs.obs_scene_add(scene, src) end
        -- Affichée : sa page montre le texte seulement quand il le faut (alerte, ou bouton).
        if item ~= nil and text_hidden_in == nil then obs.obs_sceneitem_set_visible(item, true) end
        if item ~= nil then obs.obs_sceneitem_set_order(item, obs.OBS_ORDER_MOVE_TOP) end
      end
      obs.obs_source_release(src)
    end
  end
end

-- Texte en haut à la main : la source reste affichée dans la scène, et sa page montre ou cache le
-- texte (commande « texte ») ; elle le montre aussi toute seule pendant une alerte (option).
local send_overlay
local function toggle_manual(m)
  local scene_name = current_program_scene()
  if scene_name == nil then return end
  local scene = scene_by_name(scene_name)
  if scene == nil then return end
  local item = obs.obs_scene_find_source(scene, m.name)
  if item == nil then
    if settings_ref ~= nil then ensure_manual(settings_ref, nil) end
    item = obs.obs_scene_find_source(scene, m.name)
  end
  if item == nil then return end
  if not obs.obs_sceneitem_visible(item) and text_hidden_in == nil then obs.obs_sceneitem_set_visible(item, true) end
  obs.obs_sceneitem_set_order(item, obs.OBS_ORDER_MOVE_TOP)
  send_overlay(m.key, m.name)
end

-- Commande envoyée à la page d'une source navigateur (événement JavaScript « malert ») : l'incrustation
-- par défaut, ou une autre source (texte en haut).
function send_overlay(cmd, target)
  local name = target or overlay_name
  local src = name and obs.obs_get_source_by_name(name)
  if src == nil or not src then
    obs.script_log(obs.LOG_WARNING, "M-Alert : « " .. tostring(name) .. " » introuvable (« Ajouter / mettre à jour l'incrustation » d'abord)")
    return
  end
  local cd = obs.calldata_create()
  obs.calldata_set_string(cd, "eventName", "malert")
  obs.calldata_set_string(cd, "jsonString", '{"cmd":"' .. cmd .. '"}')
  local ok = obs.proc_handler_call(obs.obs_source_get_proc_handler(src), "javascript_event", cd)
  obs.script_log(obs.LOG_INFO, "M-Alert : commande « " .. cmd .. " » envoyée à « " .. name .. " »" ..
    (ok and "" or " (refusée : source navigateur trop ancienne ?)"))
  obs.calldata_destroy(cd)
  obs.obs_source_release(src)
end
local banner_hotkey = nil
-- Autres éléments affichés ou masqués à la main (commande envoyée à la page de l'incrustation).
local OVERLAY_TOGGLES = {
  { cmd = "minimap", label = "Mini-carte (tsunami / vagues-submersion) : afficher / masquer" },
  { cmd = "table", label = "Tableau des mesures (tsunami / vagues-submersion) : afficher / masquer" },
  { cmd = "eew", label = "Alerte sismique précoce à gauche : afficher / masquer" },
  { cmd = "missile", label = "Alerte missile : afficher / masquer" },
  { cmd = "missilecard", label = "Alerte missile en plein écran : afficher / masquer" },
  { cmd = "shindofull", label = "Intensités en plein écran : afficher / masquer" },
  { cmd = "shindoreduced", label = "Intensités dans l'écran réduit : afficher / masquer" },
  { cmd = "shindomini", label = "Intensités en mini : afficher / masquer" },
  { cmd = "notsunami", label = "« Aucun risque de tsunami » : afficher / masquer" },
  { cmd = "final", label = "« Rapport final » : afficher / masquer" },
}
local toggle_hotkeys = {}
local map_hotkey = nil

local function apply(st, demo)
  if not browser_available() then
    obs.script_log(obs.LOG_ERROR, "M-Alert : OBS n'a pas de « Navigateur » (source navigateur, obs-browser). " ..
      "Sous Arch, le paquet obs-studio n'en a pas : installez obs-studio-browser (AUR) ou OBS en Flatpak (com.obsproject.Studio).")
    return
  end
  local url = overlay_url(st, demo)
  local data = browser_data(url, true)
  local src, name = find_overlay()
  if src ~= nil then
    obs.obs_source_update(src, data)
  else
    src = obs.obs_source_create("browser_source", name, data, nil)
  end
  obs.obs_data_release(data)
  if src == nil then
    obs.script_log(obs.LOG_ERROR, "M-Alert : impossible de créer la source navigateur « " .. name .. " ».")
    return
  end
  overlay_name = name
  -- Dans la scène en cours (ajoutée si elle n'y est pas encore), au premier plan. Depuis la scène de
  -- l'écran réduit : dans la scène d'avant.
  local scene_src = obs.obs_frontend_get_current_scene()
  local in_reduced = false
  if scene_src ~= nil and obs.obs_source_get_name(scene_src) == ALERT_SCENE then
    in_reduced = true
    obs.obs_source_release(scene_src)
    scene_src = program_scene and obs.obs_get_source_by_name(program_scene) or nil
  end
  if scene_src ~= nil then
    if obs.obs_source_get_name(scene_src) ~= ALERT_SCENE then program_scene = obs.obs_source_get_name(scene_src) end
    local scene = obs.obs_scene_from_source(scene_src)
    local item = obs.obs_scene_find_source(scene, name)
    if item == nil then item = obs.obs_scene_add(scene, src) end
    if item ~= nil then
      -- Écran réduit en cours : elle reste masquée dans la scène réduite (sinon, en double).
      obs.obs_sceneitem_set_visible(item, not in_reduced)
      obs.obs_sceneitem_set_order(item, obs.OBS_ORDER_MOVE_TOP)
      if in_reduced then
        local sn = obs.obs_source_get_name(scene_src)
        local listed = false
        for _, n in ipairs(hidden_list) do if n == sn then listed = true end end
        if not listed then table.insert(hidden_list, sn) end
      end
    end
    obs.script_log(obs.LOG_INFO, "M-Alert : source « " .. name .. " » dans la scène « " .. obs.obs_source_get_name(scene_src) .. " »")
    obs.obs_source_release(scene_src)
  end
  obs.obs_source_release(src)
  if obs.obs_data_get_bool(st, "reduce") then ensure_alert_scene(st, demo) end
  ensure_manual(st, demo)
  obs.script_log(obs.LOG_INFO, "M-Alert : incrustation " .. url)
  if demo == nil then
    obs.script_log(obs.LOG_INFO, "M-Alert : la source reste transparente tant qu'aucune alerte n'est en cours (« Aperçu » pour un exemple).")
  end
end

function script_description()
  if not browser_available() then
    return "<b>M-Alert</b> : <span style=\"color:#ff5555\">OBS n'a pas de source « Navigateur » (obs-browser). Sous Arch, installez <b>obs-studio-browser</b> (AUR) ou OBS en Flatpak, puis rechargez ce script.</span>"
  end
  return "<b>M-Alert</b> (script " .. PAGE_VERSION .. ") : alertes sismiques précoces, tsunamis et alertes météo incrustées comme à la NHK " ..
    "(bandeau et carte des tsunamis), en temps réel. « Ajouter / mettre à jour » crée la source navigateur " ..
    "« M-Alert » dans la scène en cours."
end

function script_properties()
  local p = obs.obs_properties_create()
  -- Libellé court ; explication complète en info-bulle (survol).
  local function tip(prop, text) if prop ~= nil and text then obs.obs_property_set_long_description(prop, text) end return prop end
  -- Groupes : sans colonne de libellés, les cases à cocher prennent toute la largeur.
  local function group(name, title, fill)
    local g = obs.obs_properties_create()
    fill(g)
    obs.obs_properties_add_group(p, name, title, obs.OBS_GROUP_NORMAL, g)
  end

  obs.obs_properties_add_text(p, "server", "Serveur M-Alert", obs.OBS_TEXT_DEFAULT)
  obs.obs_properties_add_text(p, "base", "Page d'incrustation", obs.OBS_TEXT_DEFAULT)
  obs.obs_properties_add_button(p, "apply", "Ajouter / mettre à jour l'incrustation", function() apply(settings_ref) return true end)
  obs.obs_properties_add_button(p, "demo", "Aperçu (séisme)", function() apply(settings_ref, "seisme") return true end)

  group("grp_types", "Alertes montrées", function(g)
    obs.obs_properties_add_bool(g, "type_seisme", "Séismes (alerte sismique précoce)")
    obs.obs_properties_add_bool(g, "type_tsunami", "Tsunamis")
    obs.obs_properties_add_bool(g, "type_meteo", "Météo (vent, tempête, pluie-inondation, crues…)")
    obs.obs_properties_add_bool(g, "type_pollution", "Pollution")
    obs.obs_properties_add_bool(g, "type_accident", "Accidents industriels")
    obs.obs_properties_add_bool(g, "type_attentat", "Attentats")
    obs.obs_properties_add_bool(g, "type_greve", "Grèves")
    obs.obs_properties_add_bool(g, "type_blocus", "Blocus / manifestations")
    obs.obs_properties_add_bool(g, "type_missile", "Missiles")
    obs.obs_properties_add_bool(g, "tests", "Alertes de test")
  end)
  tip(obs.obs_properties_add_text(p, "deps", "Départements", obs.OBS_TEXT_DEFAULT), "Codes des départements suivis, séparés par des virgules (ex. 13, 83, 988) ; vide : tous")
  local lv = obs.obs_properties_add_list(p, "min", "Niveau minimum", obs.OBS_COMBO_TYPE_LIST, obs.OBS_COMBO_FORMAT_INT)
  for i, n in ipairs({ "Information", "Jaune", "Orange", "Rouge", "Majeur" }) do obs.obs_property_list_add_int(lv, n, i) end

  group("grp_display", "Affichage", function(g)
    tip(obs.obs_properties_add_bool(g, "reduce", "Écran réduit pendant une alerte (comme la NHK)"),
      "L'image se réduit sur un fond bleu, avec le texte d'informations en haut et le bandeau en bas")
    tip(obs.obs_properties_add_bool(g, "text_auto", "Texte en haut pendant une alerte (sans l'écran réduit)"),
      "Écran réduit désactivé : seul le texte d'informations s'affiche en haut de l'image pendant une alerte, après le délai de l'écran réduit")
    tip(obs.obs_properties_add_bool(g, "stay", "Garder l'écran réduit tant qu'un séisme ou un tsunami est en cours"),
      "Seul le bandeau du bas part après sa durée ; le panneau de gauche, le texte du haut et le tableau restent")
    obs.obs_properties_add_bool(g, "tsunami", "Carte plein écran (tsunami, vagues-submersion)")
    obs.obs_properties_add_bool(g, "infos", "Cadre « Information(s) M-Alert » (annulation, notifications)")
    obs.obs_properties_add_bool(g, "sound", "Son des alertes (dans OBS)")
    obs.obs_properties_add_bool(g, "top", "Bandeau en haut de l'écran (sans l'écran réduit)")
  end)

  group("grp_times", "Durées et taille", function(g)
    tip(obs.obs_properties_add_int(g, "hold", "Bandeau (s)", 0, 3600, 5), "Durée d'affichage du bandeau du bas ; 0 : tant que l'alerte dure")
    tip(obs.obs_properties_add_int(g, "reduce_after", "Écran réduit / texte en haut après (s)", 0, 600, 1), "Délai avant l'écran réduit (ou le texte en haut seul) ; 0 : tout de suite")
    tip(obs.obs_properties_add_int(g, "map_seconds", "Carte plein écran (s)", 0, 600, 1), "Tsunami et vagues-submersion : durée de la carte plein écran, puis mini-carte et tableau des mesures")
    tip(obs.obs_properties_add_int(g, "card_seconds", "Missile : écran plein (s)", 0, 600, 1), "Durée de l'écran « Informations de protection civile », puis le bloc en bas sur l'image")
    obs.obs_properties_add_int(g, "cancel_hold", "Alerte annulée (s)", 3, 3600, 1)
    tip(obs.obs_properties_add_int(g, "added_seconds", "Départements ajoutés (s)", 2, 120, 1), "Durée du clignotement des départements ajoutés par une mise à jour")
    obs.obs_properties_add_int_slider(g, "width", "Largeur du bandeau (%)", 30, 100, 1)
  end)

  group("grp_manual", "Afficher / masquer à la main", function(g)
    obs.obs_properties_add_button(g, "reduce_now", "Écran réduit : activer / désactiver", function() toggle_reduced() return true end)
    for _, m in ipairs(MANUAL) do
      obs.obs_properties_add_button(g, "manual_" .. m.key, m.label, function() toggle_manual(m) return true end)
    end
    obs.obs_properties_add_button(g, "banner_toggle", "Bandeau de l'alerte : afficher / masquer", function() send_overlay("banner") return true end)
    obs.obs_properties_add_button(g, "map_toggle", "Carte tsunami / vagues-submersion : afficher / masquer", function() send_overlay("map") return true end)
    for _, t in ipairs(OVERLAY_TOGGLES) do
      obs.obs_properties_add_button(g, "toggle_" .. t.cmd, t.label, function() send_overlay(t.cmd) return true end)
    end
  end)
  return p
end

-- Réglages changés : les sources déjà ajoutées sont mises à jour toutes seules (plus besoin de
-- « Ajouter / mettre à jour »), sans en ajouter de nouvelles. Écran réduit désactivé pendant qu'il
-- est affiché : retour à la scène d'avant.
local loaded_at = nil
local function refresh_sources()
  obs.timer_remove(refresh_sources)
  local st = settings_ref
  if st == nil or not browser_available() then return end
  local src = find_overlay()
  if src == nil then return end
  local data = browser_data(overlay_url(st, nil), true)
  obs.obs_source_update(src, data)
  obs.obs_data_release(data)
  obs.obs_source_release(src)
  local fond = obs.obs_get_source_by_name(FOND_NAME)
  if fond ~= nil then
    local fd = browser_data(overlay_url(st, nil) .. "&layer=fond", false)
    obs.obs_source_update(fond, fd)
    obs.obs_data_release(fd)
    obs.obs_source_release(fond)
  end
  ensure_manual(st, nil)
  local cur = obs.obs_frontend_get_current_scene()
  if cur ~= nil then
    local name = obs.obs_source_get_name(cur)
    obs.obs_source_release(cur)
    if name == ALERT_SCENE and not obs.obs_data_get_bool(st, "reduce") then
      local back = program_scene and obs.obs_get_source_by_name(program_scene)
      if back ~= nil and back then obs.obs_frontend_set_current_scene(back); obs.obs_source_release(back) end
    end
  end
  obs.script_log(obs.LOG_INFO, "M-Alert : réglages appliqués aux sources")
end

function script_defaults(st)
  obs.obs_data_set_default_string(st, "server", "https://m-alert-sender.onrender.com")
  obs.obs_data_set_default_string(st, "base", DEFAULT_BASE)
  for _, t in ipairs(CATEGORIES) do
    obs.obs_data_set_default_bool(st, "type_" .. t, true)
  end
  obs.obs_data_set_default_int(st, "min", 2)
  obs.obs_data_set_default_int(st, "hold", 90)
  obs.obs_data_set_default_int(st, "cancel_hold", 30)
  obs.obs_data_set_default_int(st, "added_seconds", 10)
  obs.obs_data_set_default_int(st, "map_seconds", 20)
  obs.obs_data_set_default_int(st, "width", 66)
  obs.obs_data_set_default_bool(st, "tsunami", true)
  obs.obs_data_set_default_bool(st, "reduce", true)
  obs.obs_data_set_default_bool(st, "text_auto", true)
  obs.obs_data_set_default_int(st, "reduce_after", 10)
  obs.obs_data_set_default_bool(st, "stay", true)
  obs.obs_data_set_default_int(st, "card_seconds", 20)
  obs.obs_data_set_default_bool(st, "infos", true)
  obs.obs_data_set_default_bool(st, "sound", true)
  obs.obs_data_set_default_bool(st, "tests", true)
end

function script_load(st)
  settings_ref = st
  loaded_at = obs.os_gettime_ns()
  obs.obs_frontend_add_event_callback(on_event)
  -- Raccourci clavier (Paramètres > Raccourcis clavier) : écran réduit à la main.
  hotkey_id = obs.obs_hotkey_register_frontend("malert_reduce", "M-Alert : écran réduit (activer / désactiver)", function(pressed)
    if pressed then toggle_reduced() end
  end)
  local keys = obs.obs_data_get_array(st, "malert_reduce_hotkey")
  obs.obs_hotkey_load(hotkey_id, keys)
  obs.obs_data_array_release(keys)
  banner_hotkey = obs.obs_hotkey_register_frontend("malert_bandeau", "M-Alert : bandeau de l'alerte : afficher / masquer", function(pressed)
    if pressed then send_overlay("banner") end
  end)
  local bk = obs.obs_data_get_array(st, "malert_bandeau_hotkey")
  obs.obs_hotkey_load(banner_hotkey, bk)
  obs.obs_data_array_release(bk)
  map_hotkey = obs.obs_hotkey_register_frontend("malert_carte", "M-Alert : carte tsunami / vagues-submersion : afficher / masquer", function(pressed)
    if pressed then send_overlay("map") end
  end)
  local mk = obs.obs_data_get_array(st, "malert_carte_hotkey")
  obs.obs_hotkey_load(map_hotkey, mk)
  obs.obs_data_array_release(mk)
  for _, t in ipairs(OVERLAY_TOGGLES) do
    local id = obs.obs_hotkey_register_frontend("malert_" .. t.cmd, "M-Alert : " .. t.label:gsub("^%u", string.lower), function(pressed)
      if pressed then send_overlay(t.cmd) end
    end)
    toggle_hotkeys[t.cmd] = id
    local k = obs.obs_data_get_array(st, "malert_" .. t.cmd .. "_hotkey")
    obs.obs_hotkey_load(id, k)
    obs.obs_data_array_release(k)
  end
  for _, m in ipairs(MANUAL) do
    local id = obs.obs_hotkey_register_frontend("malert_" .. m.key, "M-Alert : " .. m.label:lower(), function(pressed)
      if pressed then toggle_manual(m) end
    end)
    manual_hotkeys[m.key] = id
    local k = obs.obs_data_get_array(st, "malert_" .. m.key .. "_hotkey")
    obs.obs_hotkey_load(id, k)
    obs.obs_data_array_release(k)
  end
  local src, name = find_overlay()
  if src ~= nil then obs.obs_source_release(src) end
  overlay_name = name
  local cur = obs.obs_frontend_get_current_scene()
  if cur ~= nil then
    local cur_name = obs.obs_source_get_name(cur)
    obs.obs_source_release(cur)
    if cur_name ~= ALERT_SCENE then program_scene = cur_name
    else enter_reduced(true) end -- OBS ouvert sur l'écran réduit : incrustation masquée dans la scène réduite
  end
end

function script_save(st)
  if hotkey_id == nil then return end
  local keys = obs.obs_hotkey_save(hotkey_id)
  obs.obs_data_set_array(st, "malert_reduce_hotkey", keys)
  obs.obs_data_array_release(keys)
  for _, t in ipairs(OVERLAY_TOGGLES) do
    if toggle_hotkeys[t.cmd] ~= nil then
      local k = obs.obs_hotkey_save(toggle_hotkeys[t.cmd])
      obs.obs_data_set_array(st, "malert_" .. t.cmd .. "_hotkey", k)
      obs.obs_data_array_release(k)
    end
  end
  if map_hotkey ~= nil then
    local mk = obs.obs_hotkey_save(map_hotkey)
    obs.obs_data_set_array(st, "malert_carte_hotkey", mk)
    obs.obs_data_array_release(mk)
  end
  if banner_hotkey ~= nil then
    local bk = obs.obs_hotkey_save(banner_hotkey)
    obs.obs_data_set_array(st, "malert_bandeau_hotkey", bk)
    obs.obs_data_array_release(bk)
  end
  for _, m in ipairs(MANUAL) do
    if manual_hotkeys[m.key] ~= nil then
      local k = obs.obs_hotkey_save(manual_hotkeys[m.key])
      obs.obs_data_set_array(st, "malert_" .. m.key .. "_hotkey", k)
      obs.obs_data_array_release(k)
    end
  end
end

function script_unload()
  obs.timer_remove(anim_tick)
  obs.timer_remove(refresh_sources)
  restore_overlay()
end
function script_update(st)
  settings_ref = st
  -- Au chargement d'OBS (premier appel) : rien à refaire.
  if loaded_at == nil or obs.os_gettime_ns() - loaded_at < 3e9 then return end
  obs.timer_remove(refresh_sources)
  obs.timer_add(refresh_sources, 800)
end
