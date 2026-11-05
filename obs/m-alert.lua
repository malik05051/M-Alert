--[[
M-Alert pour OBS Studio : incrustation des alertes (alerte sismique précoce, tsunami, météo…)
façon NHK, en temps réel depuis le serveur M-Alert.

Installation : OBS > Outils > Scripts > « + » > ce fichier (m-alert.lua). Choisissez la scène,
réglez les options puis « Ajouter / mettre à jour l'incrustation ». Le script crée (ou met à
jour) une source navigateur « M-Alert » de 1920 × 1080, fond transparent, dont le son passe par
OBS. La source affiche :
  - le bandeau d'alerte (carte à gauche, titre, consigne, lieux) quand une alerte arrive ;
  - la carte des côtes en alerte tsunami, qui clignotent, tant qu'un tsunami est en cours.
]]

obs = obslua

local SOURCE_NAME = "M-Alert"
local settings_ref = nil

local function urlencode(s)
  return (tostring(s):gsub("[^%w%-%._~]", function(c) return string.format("%%%02X", string.byte(c)) end))
end

local function overlay_url(st)
  local base = obs.obs_data_get_string(st, "base")
  local params = {}
  local function add(k, v) if v ~= nil and v ~= "" then table.insert(params, k .. "=" .. urlencode(v)) end end
  add("server", obs.obs_data_get_string(st, "server"))
  local types = {}
  for _, t in ipairs({ "seisme", "tsunami", "meteo", "pollution", "incendie", "attentat", "blocus", "autre" }) do
    if obs.obs_data_get_bool(st, "type_" .. t) then table.insert(types, t) end
  end
  if #types < 8 then add("types", table.concat(types, ",")) end
  add("deps", obs.obs_data_get_string(st, "deps"))
  add("min", tostring(obs.obs_data_get_int(st, "min")))
  add("hold", tostring(obs.obs_data_get_int(st, "hold")))
  if obs.obs_data_get_bool(st, "sound") then add("sound", "1") end
  if not obs.obs_data_get_bool(st, "tests") then add("tests", "0") end
  if not obs.obs_data_get_bool(st, "tsunami") then add("tsunami", "0") end
  if obs.obs_data_get_bool(st, "top") then add("pos", "top") end
  add("width", tostring(obs.obs_data_get_int(st, "width")))
  local q = table.concat(params, "&")
  return base .. (base:find("?", 1, true) and "&" or "?") .. q
end

local function apply(st)
  local url = overlay_url(st)
  local src = obs.obs_get_source_by_name(SOURCE_NAME)
  local data = obs.obs_data_create()
  obs.obs_data_set_string(data, "url", url)
  obs.obs_data_set_bool(data, "is_local_file", false)
  obs.obs_data_set_int(data, "width", 1920)
  obs.obs_data_set_int(data, "height", 1080)
  obs.obs_data_set_bool(data, "reroute_audio", true)
  obs.obs_data_set_bool(data, "shutdown", false)
  obs.obs_data_set_bool(data, "restart_when_active", false)
  obs.obs_data_set_string(data, "css", "body { background-color: rgba(0, 0, 0, 0); margin: 0px auto; overflow: hidden; }")
  if src ~= nil then
    obs.obs_source_update(src, data)
    obs.obs_source_release(src)
  else
    src = obs.obs_source_create("browser_source", SOURCE_NAME, data, nil)
    local scene_src = obs.obs_frontend_get_current_scene()
    if scene_src ~= nil then
      local scene = obs.obs_scene_from_source(scene_src)
      obs.obs_scene_add(scene, src)
      obs.obs_source_release(scene_src)
    end
    obs.obs_source_release(src)
  end
  obs.obs_data_release(data)
  obs.script_log(obs.LOG_INFO, "M-Alert : incrustation " .. url)
end

function script_description()
  return "<b>M-Alert</b> : alertes sismiques précoces, tsunamis et alertes météo incrustées comme à la NHK " ..
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
  obs.obs_properties_add_bool(p, "type_incendie", "Incendies")
  obs.obs_properties_add_bool(p, "type_attentat", "Attentats")
  obs.obs_properties_add_bool(p, "type_blocus", "Blocages")
  obs.obs_properties_add_bool(p, "type_autre", "Autres")
  obs.obs_properties_add_text(p, "deps", "Départements (codes, vide : tous)", obs.OBS_TEXT_DEFAULT)
  local lv = obs.obs_properties_add_list(p, "min", "Niveau minimum", obs.OBS_COMBO_TYPE_LIST, obs.OBS_COMBO_FORMAT_INT)
  for i, n in ipairs({ "Information", "Jaune", "Orange", "Rouge", "Majeur" }) do obs.obs_property_list_add_int(lv, n, i) end
  obs.obs_properties_add_int(p, "hold", "Bandeau affiché (s, 0 : tant que l'alerte dure)", 0, 3600, 5)
  obs.obs_properties_add_int_slider(p, "width", "Largeur du bandeau (% de l'écran)", 30, 100, 1)
  obs.obs_properties_add_bool(p, "top", "Bandeau en haut de l'écran")
  obs.obs_properties_add_bool(p, "tsunami", "Carte des tsunamis en plein écran")
  obs.obs_properties_add_bool(p, "sound", "Son des alertes (dans OBS)")
  obs.obs_properties_add_bool(p, "tests", "Montrer les alertes de test")
  obs.obs_properties_add_button(p, "apply", "Ajouter / mettre à jour l'incrustation", function() apply(settings_ref) return true end)
  obs.obs_properties_add_button(p, "demo", "Aperçu (séisme)", function()
    local d = obs.obs_data_create()
    obs.obs_data_apply(d, settings_ref)
    obs.obs_data_set_string(d, "base", obs.obs_data_get_string(settings_ref, "base") .. "?demo=seisme")
    apply(d)
    obs.obs_data_release(d)
    return true
  end)
  return p
end

function script_defaults(st)
  obs.obs_data_set_default_string(st, "server", "https://m-alert-sender.onrender.com")
  obs.obs_data_set_default_string(st, "base", "https://malik05051.github.io/M-Alert/obs/")
  for _, t in ipairs({ "seisme", "tsunami", "meteo", "pollution", "incendie", "attentat", "blocus", "autre" }) do
    obs.obs_data_set_default_bool(st, "type_" .. t, true)
  end
  obs.obs_data_set_default_int(st, "min", 2)
  obs.obs_data_set_default_int(st, "hold", 90)
  obs.obs_data_set_default_int(st, "width", 66)
  obs.obs_data_set_default_bool(st, "tsunami", true)
  obs.obs_data_set_default_bool(st, "sound", true)
  obs.obs_data_set_default_bool(st, "tests", true)
end

function script_load(st) settings_ref = st end
function script_update(st) settings_ref = st end
