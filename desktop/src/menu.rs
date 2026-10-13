use serde::Deserialize;
use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::menu::{
    CheckMenuItemBuilder, MenuBuilder, MenuId, MenuItemBuilder, MenuItemKind, PredefinedMenuItem,
    Submenu, SubmenuBuilder,
};
use tauri::Manager;

/// Edit items that a focused text field performs itself.
///
/// While a text field has focus they are the OS's own items, which act on the
/// focused field like the Edit menu of any app. Otherwise they are ours and emit
/// the editor command for the canvas. Linux keeps ours: muda's native edit items
/// need optional X11 automation and do not work on Wayland.
const TEXT_FIELD_EDIT_IDS: [&str; 3] = ["edit.undo", "edit.redo", "selection.selectAll"];

/// Whether a text field has focus, and which native item stands for each of
/// `TEXT_FIELD_EDIT_IDS` in the installed menu.
#[derive(Default)]
pub struct TextFieldFocus {
    focused: AtomicBool,
    items: Mutex<HashMap<&'static str, MenuId>>,
}

#[derive(Deserialize)]
struct MenuGroup {
    label: String,
    items: Vec<MenuEntry>,
}

#[derive(Deserialize)]
struct MenuEntry {
    #[serde(default)]
    r#type: Option<String>,
    id: Option<String>,
    label: Option<String>,
    accelerator: Option<String>,
    #[serde(default)]
    checkbox: bool,
    #[serde(default)]
    sub: Vec<MenuEntry>,
}

#[cfg(target_os = "macos")]
#[derive(Deserialize)]
struct AppMenuItem {
    label: String,
    accelerator: Option<String>,
}

/// Generated from `APP_MENU_APP_ITEMS`; placement stays here because the
/// OS-predefined items sit between these entries.
#[cfg(target_os = "macos")]
#[derive(Deserialize)]
struct AppMenuFile {
    about: AppMenuItem,
    #[serde(rename = "check-updates")]
    check_updates: AppMenuItem,
    settings: AppMenuItem,
    quit: AppMenuItem,
}

#[cfg(target_os = "macos")]
fn app_menu_file() -> tauri::Result<AppMenuFile> {
    Ok(serde_json::from_str(include_str!(
        "../generated/app-menu.json"
    ))?)
}

/// The macOS application menu holds Settings…, so the schema's copy is left out there, along
/// with a separator it would leave at the end of its menu.
fn platform_entries(items: &[MenuEntry]) -> Vec<&MenuEntry> {
    let mut entries: Vec<&MenuEntry> = items
        .iter()
        .filter(|entry| !(cfg!(target_os = "macos") && entry.id.as_deref() == Some("settings")))
        .collect();
    while entries
        .last()
        .is_some_and(|entry| entry.r#type.as_deref() == Some("separator"))
    {
        entries.pop();
    }
    entries
}

fn build_submenu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    label: &str,
    items: &[MenuEntry],
    recent_files: &[String],
) -> tauri::Result<Submenu<R>> {
    let mut builder = SubmenuBuilder::new(app, label);

    for entry in platform_entries(items) {
        if entry.r#type.as_deref() == Some("separator") {
            builder = builder.separator();
            continue;
        }

        let label = entry.label.as_deref().unwrap_or_default();
        if entry.id.as_deref() == Some("open-recent") {
            let submenu = build_recent_files_submenu(app, label, recent_files)?;
            builder = builder.item(&submenu);
            continue;
        }
        if !entry.sub.is_empty() {
            let submenu = build_submenu(app, label, &entry.sub, recent_files)?;
            builder = builder.item(&submenu);
            continue;
        }

        if let Some(id) = entry.id.as_deref().and_then(|id| {
            TEXT_FIELD_EDIT_IDS
                .into_iter()
                .find(|edit_id| *edit_id == id)
        }) {
            builder = builder.item(&text_field_edit_item(
                app,
                id,
                label,
                entry.accelerator.as_deref(),
            )?);
            continue;
        }

        // Ordinary menu accelerators emit a frontend command without preserving the
        // WebView's focused editing control. Native edit items let WebKit/WebView2
        // route copy, cut, and paste to inputs or dispatch canvas clipboard events.
        // Keep Linux on the frontend path: muda's native edit items require optional
        // X11 automation and are explicitly unsupported on Wayland.
        #[cfg(any(target_os = "macos", target_os = "windows"))]
        if let Some(id) = entry.id.as_deref() {
            let native_edit_item = match id {
                "copy" => Some(PredefinedMenuItem::copy(app, Some(label))?),
                "cut" => Some(PredefinedMenuItem::cut(app, Some(label))?),
                "paste" => Some(PredefinedMenuItem::paste(app, Some(label))?),
                _ => None,
            };
            if let Some(item) = native_edit_item {
                builder = builder.item(&item);
                continue;
            }
        }

        if entry.checkbox {
            let mut item = CheckMenuItemBuilder::new(label).checked(true);
            if let Some(id) = &entry.id {
                item = item.id(id);
            }
            if let Some(accelerator) = &entry.accelerator {
                item = item.accelerator(accelerator);
            }
            builder = builder.item(&item.build(app)?);
            continue;
        }

        let mut item = MenuItemBuilder::new(label);
        if let Some(id) = &entry.id {
            item = item.id(id);
        }
        // On Linux, muda's predefined edit commands depend on optional X11
        // automation and do not work on Wayland. Leave these accelerators to the
        // WebView instead, which preserves native input and canvas paste events.
        let webview_handles_accelerator = cfg!(target_os = "linux")
            && matches!(entry.id.as_deref(), Some("copy" | "cut" | "paste"));
        if !webview_handles_accelerator {
            if let Some(accelerator) = &entry.accelerator {
                item = item.accelerator(accelerator);
            }
        }
        builder = builder.item(&item.build(app)?);
    }

    builder.build()
}

fn text_field_edit_item<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    id: &'static str,
    label: &str,
    accelerator: Option<&str>,
) -> tauri::Result<MenuItemKind<R>> {
    let focus = app.state::<TextFieldFocus>();
    let native = cfg!(any(target_os = "macos", target_os = "windows"))
        && focus.focused.load(Ordering::SeqCst);
    let item = if native {
        MenuItemKind::Predefined(match id {
            "edit.undo" => PredefinedMenuItem::undo(app, Some(label))?,
            "edit.redo" => PredefinedMenuItem::redo(app, Some(label))?,
            _ => PredefinedMenuItem::select_all(app, Some(label))?,
        })
    } else {
        let mut item = MenuItemBuilder::new(label).id(id);
        if let Some(accelerator) = accelerator {
            item = item.accelerator(accelerator);
        }
        MenuItemKind::MenuItem(item.build(app)?)
    };
    focus
        .items
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .insert(id, item.id().clone());
    Ok(item)
}

/// Swaps the text-field edit items between the OS's own and ours as focus
/// enters or leaves a text field in the WebView.
#[tauri::command]
pub fn set_text_field_focus<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    focused: bool,
) -> Result<(), String> {
    let focus = app.state::<TextFieldFocus>();
    let changed = focus.focused.swap(focused, Ordering::SeqCst) != focused;
    if !changed || !cfg!(any(target_os = "macos", target_os = "windows")) {
        return Ok(());
    }
    let Some(menu) = app.menu() else {
        return Ok(());
    };
    let current: HashMap<MenuId, &'static str> = focus
        .items
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .iter()
        .map(|(id, item)| (item.clone(), *id))
        .collect();
    for group in menu.items().map_err(|error| error.to_string())? {
        let MenuItemKind::Submenu(submenu) = group else {
            continue;
        };
        for (position, item) in submenu
            .items()
            .map_err(|error| error.to_string())?
            .into_iter()
            .enumerate()
        {
            let Some(id) = current.get(item.id()).copied() else {
                continue;
            };
            let label = match &item {
                MenuItemKind::MenuItem(item) => item.text(),
                MenuItemKind::Predefined(item) => item.text(),
                _ => continue,
            }
            .map_err(|error| error.to_string())?;
            let accelerator = menu_accelerator(id);
            let replacement = text_field_edit_item(&app, id, &label, accelerator.as_deref())
                .map_err(|error| error.to_string())?;
            submenu.remove(&item).map_err(|error| error.to_string())?;
            submenu
                .insert(&replacement, position)
                .map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn menu_accelerator(id: &str) -> Option<String> {
    fn find(entries: &[MenuEntry], id: &str) -> Option<String> {
        entries.iter().find_map(|entry| {
            if entry.id.as_deref() == Some(id) {
                entry.accelerator.clone()
            } else {
                find(&entry.sub, id)
            }
        })
    }
    let groups: Vec<MenuGroup> =
        serde_json::from_str(include_str!("../generated/menu.json")).ok()?;
    groups.iter().find_map(|group| find(&group.items, id))
}

fn recent_file_label(path: &str) -> String {
    let path = Path::new(path);
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .map(str::to_owned)
        .unwrap_or_else(|| path.as_os_str().to_string_lossy().into_owned());
    let parent = path
        .parent()
        .and_then(Path::file_name)
        .and_then(|name| name.to_str());
    parent.map_or(name.clone(), |parent| format!("{name} — {parent}"))
}

fn build_recent_files_submenu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    label: &str,
    recent_files: &[String],
) -> tauri::Result<Submenu<R>> {
    let mut builder =
        SubmenuBuilder::with_id(app, "open-recent", label).enabled(!recent_files.is_empty());
    for (index, path) in recent_files.iter().enumerate() {
        let item = MenuItemBuilder::new(recent_file_label(path))
            .id(format!("open-recent:{index}"))
            .build(app)?;
        builder = builder.item(&item);
    }
    if !recent_files.is_empty() {
        builder = builder.separator().item(
            &MenuItemBuilder::new("Clear Menu")
                .id("clear-recent-files")
                .build(app)?,
        );
    }
    builder.build()
}

fn build_schema_menus<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    recent_files: &[String],
) -> tauri::Result<Vec<Submenu<R>>> {
    let groups: Vec<MenuGroup> = serde_json::from_str(include_str!("../generated/menu.json"))?;
    groups
        .iter()
        .map(|group| build_submenu(app, &group.label, &group.items, recent_files))
        .collect()
}

fn find_menu_item<R: tauri::Runtime>(
    items: Vec<MenuItemKind<R>>,
    id: &str,
) -> Option<MenuItemKind<R>> {
    for item in items {
        if item.id().0 == id {
            return Some(item);
        }
        if let MenuItemKind::Submenu(submenu) = &item {
            if let Ok(children) = submenu.items() {
                if let Some(found) = find_menu_item(children, id) {
                    return Some(found);
                }
            }
        }
    }
    None
}

#[tauri::command]
pub fn native_menu_checked<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    id: String,
) -> Result<bool, String> {
    let menu = app
        .menu()
        .ok_or_else(|| "Application menu is unavailable".to_string())?;
    let item = find_menu_item(menu.items().map_err(|error| error.to_string())?, &id)
        .ok_or_else(|| format!("Menu item not found: {id}"))?;
    match item {
        MenuItemKind::Check(item) => item.is_checked().map_err(|error| error.to_string()),
        _ => Err(format!("Menu item is not checkable: {id}")),
    }
}

#[tauri::command]
pub fn set_native_menu_checked<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    id: String,
    checked: bool,
) -> Result<(), String> {
    let menu = app
        .menu()
        .ok_or_else(|| "Application menu is unavailable".to_string())?;
    let item = find_menu_item(menu.items().map_err(|error| error.to_string())?, &id)
        .ok_or_else(|| format!("Menu item not found: {id}"))?;
    match item {
        MenuItemKind::Check(item) => item.set_checked(checked).map_err(|error| error.to_string()),
        _ => Err(format!("Menu item is not checkable: {id}")),
    }
}

pub fn install_app_menu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    recent_files: &[String],
) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    let app_menu = {
        let items = app_menu_file()?;
        let mut check_updates =
            MenuItemBuilder::new(&items.check_updates.label).id("check-updates");
        if let Some(accelerator) = &items.check_updates.accelerator {
            check_updates = check_updates.accelerator(accelerator);
        }
        let mut settings = MenuItemBuilder::new(&items.settings.label).id("settings");
        if let Some(accelerator) = &items.settings.accelerator {
            settings = settings.accelerator(accelerator);
        }
        let mut quit = MenuItemBuilder::new(&items.quit.label).id("quit");
        if let Some(accelerator) = &items.quit.accelerator {
            quit = quit.accelerator(accelerator);
        }
        SubmenuBuilder::new(app, tauri::Manager::package_info(app).name.clone())
            .item(&PredefinedMenuItem::about(
                app,
                Some(&items.about.label),
                None,
            )?)
            .item(&check_updates.build(app)?)
            .separator()
            .item(&settings.build(app)?)
            .separator()
            .item(&PredefinedMenuItem::services(app, None)?)
            .separator()
            .item(&PredefinedMenuItem::hide(app, None)?)
            .item(&PredefinedMenuItem::hide_others(app, None)?)
            .item(&PredefinedMenuItem::show_all(app, None)?)
            .separator()
            .item(&quit.build(app)?)
            .build()?
    };

    let schema_menus = build_schema_menus(app, recent_files)?;
    let mut builder = MenuBuilder::new(app);

    #[cfg(target_os = "macos")]
    {
        builder = builder.item(&app_menu);
    }

    for menu in &schema_menus {
        builder = builder.item(menu);
    }

    app.set_menu(builder.build()?)?;
    Ok(())
}
