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
local PAGE_VERSION = "3.0.0-17"
local DEFAULT_BASE = "https://malik05051.github.io/M-Alert/obs/"
-- Écran réduit (comme la NHK) : scène où OBS passe pendant une alerte, et sa source de fond.
local ALERT_SCENE = "M-Alert (alerte)"
local FOND_NAME = "M-Alert (fond)"
local REDUCED_SCALE = 0.8   -- image du direct réduite à 80 %
local REDUCED_Y = 196       -- sous le texte d'informations (canevas 1920 × 1080)
local ANIM_MS = 500
-- Catégories des alertes M-Alert (comme dans l'application).
local CATEGORIES = { "seisme", "tsunami", "meteo", "pollution", "accident", "attentat", "greve", "blocus" }
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
  add("mapSeconds", demo and "8" or tostring(obs.obs_data_get_int(st, "map_seconds")))
  if obs.obs_data_get_bool(st, "reduce") then
    add("reduce", ALERT_SCENE)
    add("reduceAfter", demo and "3" or tostring(obs.obs_data_get_int(st, "reduce_after")))
  end
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

local function set_overlay_visible(scene_name, visible)
  if scene_name == nil or overlay_name == nil then return end
  local scene = scene_by_name(scene_name)
  if scene == nil then return end
  local item = obs.obs_scene_find_source(scene, overlay_name)
  if item ~= nil then obs.obs_sceneitem_set_visible(item, visible) end
end

-- OBS est passé sur la scène de l'écran réduit : la scène d'avant y est mise, réduite (animation),
-- et l'incrustation y est masquée (elle reste affichée en grand au premier plan).
local function enter_reduced()
  local scene = scene_by_name(ALERT_SCENE)
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
  set_xform(item, 0)
  set_overlay_visible(program_scene, false)
  hidden_in = program_scene
  -- Texte en haut seul (affiché à la main) : masqué dans la scène réduite (le fond a déjà le texte).
  local ps = scene_by_name(program_scene)
  local ti = ps and obs.obs_scene_find_source(ps, "M-Alert (texte)")
  if ti ~= nil and ti and obs.obs_sceneitem_visible(ti) then
    obs.obs_sceneitem_set_visible(ti, false)
    text_hidden_in = program_scene
  end
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
    if hidden_in ~= nil then set_overlay_visible(hidden_in, true); hidden_in = nil end
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
  for _, m in ipairs(MANUAL) do
    local data = browser_data(overlay_url(st, demo) .. "&layer=" .. m.key, false)
    local src = upsert_browser(m.name, data)
    obs.obs_data_release(data)
    if src ~= nil then
      if scene ~= nil and scene then
        local item = obs.obs_scene_find_source(scene, m.name)
        if item == nil then
          item = obs.obs_scene_add(scene, src)
          if item ~= nil then obs.obs_sceneitem_set_visible(item, false) end
        end
        if item ~= nil then obs.obs_sceneitem_set_order(item, obs.OBS_ORDER_MOVE_TOP) end
      end
      obs.obs_source_release(src)
    end
  end
end

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
  local visible = not obs.obs_sceneitem_visible(item)
  obs.obs_sceneitem_set_visible(item, visible)
  obs.obs_sceneitem_set_order(item, obs.OBS_ORDER_MOVE_TOP)
  obs.script_log(obs.LOG_INFO, "M-Alert : « " .. m.name .. " » " .. (visible and "affiché" or "masqué") .. " dans « " .. scene_name .. " »")
end

-- Commande envoyée à la page de l'incrustation (événement JavaScript « malert »).
local function send_overlay(cmd)
  local src = overlay_name and obs.obs_get_source_by_name(overlay_name)
  if src == nil or not src then
    obs.script_log(obs.LOG_WARNING, "M-Alert : incrustation introuvable (« Ajouter / mettre à jour l'incrustation » d'abord)")
    return
  end
  local cd = obs.calldata_create()
  obs.calldata_set_string(cd, "eventName", "malert")
  obs.calldata_set_string(cd, "jsonString", '{"cmd":"' .. cmd .. '"}')
  local ok = obs.proc_handler_call(obs.obs_source_get_proc_handler(src), "javascript_event", cd)
  obs.script_log(obs.LOG_INFO, "M-Alert : commande « " .. cmd .. " » envoyée à « " .. overlay_name .. " »" ..
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
  if scene_src ~= nil and obs.obs_source_get_name(scene_src) == ALERT_SCENE then
    obs.obs_source_release(scene_src)
    scene_src = program_scene and obs.obs_get_source_by_name(program_scene) or nil
  end
  if scene_src ~= nil then
    if obs.obs_source_get_name(scene_src) ~= ALERT_SCENE then program_scene = obs.obs_source_get_name(scene_src) end
    local scene = obs.obs_scene_from_source(scene_src)
    local item = obs.obs_scene_find_source(scene, name)
    if item == nil then item = obs.obs_scene_add(scene, src) end
    if item ~= nil then
      obs.obs_sceneitem_set_visible(item, true)
      obs.obs_sceneitem_set_order(item, obs.OBS_ORDER_MOVE_TOP)
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
  obs.obs_properties_add_text(p, "server", "Serveur M-Alert", obs.OBS_TEXT_DEFAULT)
  obs.obs_properties_add_text(p, "base", "Page d'incrustation", obs.OBS_TEXT_DEFAULT)
  obs.obs_properties_add_bool(p, "type_seisme", "Séismes (alerte sismique précoce)")
  obs.obs_properties_add_bool(p, "type_tsunami", "Tsunamis")
  obs.obs_properties_add_bool(p, "type_meteo", "Météo (vent, tempête, pluie-inondation, crues…)")
  obs.obs_properties_add_bool(p, "type_pollution", "Pollution")
  obs.obs_properties_add_bool(p, "type_accident", "Accidents industriels")
  obs.obs_properties_add_bool(p, "type_attentat", "Attentats")
  obs.obs_properties_add_bool(p, "type_greve", "Grèves")
  obs.obs_properties_add_bool(p, "type_blocus", "Blocus / manifestations")
  obs.obs_properties_add_text(p, "deps", "Départements (codes, vide : tous)", obs.OBS_TEXT_DEFAULT)
  local lv = obs.obs_properties_add_list(p, "min", "Niveau minimum", obs.OBS_COMBO_TYPE_LIST, obs.OBS_COMBO_FORMAT_INT)
  for i, n in ipairs({ "Information", "Jaune", "Orange", "Rouge", "Majeur" }) do obs.obs_property_list_add_int(lv, n, i) end
  obs.obs_properties_add_int(p, "hold", "Bandeau affiché (s, 0 : tant que l'alerte dure)", 0, 3600, 5)
  obs.obs_properties_add_int(p, "cancel_hold", "Alerte annulée affichée (s)", 3, 3600, 1)
  obs.obs_properties_add_int(p, "added_seconds", "Départements ajoutés : clignotement (s)", 2, 120, 1)
  obs.obs_properties_add_int(p, "map_seconds", "Tsunami / vagues-submersion : carte plein écran (s), puis tableau", 0, 600, 1)
  obs.obs_properties_add_int_slider(p, "width", "Largeur du bandeau (% de l'écran)", 30, 100, 1)
  obs.obs_properties_add_bool(p, "reduce", "Réduire l'image pendant une alerte (texte d'informations en haut, comme la NHK)")
  obs.obs_properties_add_int(p, "reduce_after", "Écran réduit après (s, 0 : tout de suite)", 0, 600, 1)
  obs.obs_properties_add_button(p, "reduce_now", "Écran réduit : activer / désactiver", function() toggle_reduced() return true end)
  for _, m in ipairs(MANUAL) do
    obs.obs_properties_add_button(p, "manual_" .. m.key, m.label, function() toggle_manual(m) return true end)
  end
  obs.obs_properties_add_button(p, "banner_toggle", "Bandeau de l'alerte : afficher / masquer", function() send_overlay("banner") return true end)
  obs.obs_properties_add_button(p, "map_toggle", "Carte tsunami / vagues-submersion : afficher / masquer", function() send_overlay("map") return true end)
  for _, t in ipairs(OVERLAY_TOGGLES) do
    obs.obs_properties_add_button(p, "toggle_" .. t.cmd, t.label, function() send_overlay(t.cmd) return true end)
  end
  obs.obs_properties_add_bool(p, "top", "Bandeau en haut de l'écran (sans l'écran réduit)")
  obs.obs_properties_add_bool(p, "tsunami", "Carte des tsunamis en plein écran")
  obs.obs_properties_add_bool(p, "infos", "Cadre « Information(s) M-Alert » (alerte annulée, notifications)")
  obs.obs_properties_add_bool(p, "sound", "Son des alertes (dans OBS)")
  obs.obs_properties_add_bool(p, "tests", "Montrer les alertes de test")
  obs.obs_properties_add_button(p, "apply", "Ajouter / mettre à jour l'incrustation", function() apply(settings_ref) return true end)
  obs.obs_properties_add_button(p, "demo", "Aperçu (séisme)", function()
    apply(settings_ref, "seisme")
    return true
  end)
  return p
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
  obs.obs_data_set_default_int(st, "reduce_after", 10)
  obs.obs_data_set_default_bool(st, "infos", true)
  obs.obs_data_set_default_bool(st, "sound", true)
  obs.obs_data_set_default_bool(st, "tests", true)
end

function script_load(st)
  settings_ref = st
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
    if obs.obs_source_get_name(cur) ~= ALERT_SCENE then program_scene = obs.obs_source_get_name(cur) end
    obs.obs_source_release(cur)
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
  if hidden_in ~= nil then set_overlay_visible(hidden_in, true) end
end
function script_update(st) settings_ref = st end
