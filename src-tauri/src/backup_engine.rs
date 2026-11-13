//! Backup engine: recursive copy of source paths with include/exclude masks.

use crate::config::BackupJob;
use crate::errors::{AppError, AppResult};
use glob::Pattern;
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use walkdir::WalkDir;

/// Result of a single backup run.
#[derive(Debug, Clone)]
pub struct BackupResult {
    pub job_id: String,
    pub job_name: String,
    pub started_at: String,
    pub finished_at: String,
    pub files_copied: u64,
    pub bytes_copied: u64,
    pub errors: Vec<String>,
    /// True if the run was cancelled by the user before completion.
    pub cancelled: bool,
}

/// Normalize a path to a forward-slash string (glob crate uses `/`).
fn to_slash(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

/// True if `name` (or optional relative path) matches the mask.
fn mask_matches(mask: &str, file_name: &str, rel_slash: &str) -> bool {
    match Pattern::new(mask) {
        Ok(pat) => pat.matches(file_name) || pat.matches(rel_slash),
        Err(_) => false,
    }
}

/// Decide whether a file should be copied, using include/exclude masks.
/// Masks are tested against the file name and the path relative to the source root.
fn file_matches(path: &Path, source_root: &Path, job: &BackupJob) -> bool {
    let file_name = path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let rel_slash = path
        .strip_prefix(source_root)
        .map(to_slash)
        .unwrap_or_else(|_| to_slash(path));

    // Exclude masks take precedence.
    for excl in &job.exclude_masks {
        if mask_matches(excl, &file_name, &rel_slash) {
            return false;
        }
    }

    // If include masks are defined, at least one must match.
    if !job.include_masks.is_empty() {
        return job
            .include_masks
            .iter()
            .any(|incl| mask_matches(incl, &file_name, &rel_slash));
    }

    true
}

/// Decide whether a directory should be pruned during traversal.
/// Only exclude masks apply to directories (include masks never prune folders,
/// otherwise `*.docx` would skip the whole tree).
fn dir_excluded(path: &Path, source_root: &Path, job: &BackupJob) -> bool {
    if job.exclude_masks.is_empty() {
        return false;
    }
    let dir_name = path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let rel_slash = path
        .strip_prefix(source_root)
        .map(to_slash)
        .unwrap_or_else(|_| to_slash(path));

    job.exclude_masks
        .iter()
        .any(|excl| mask_matches(excl, &dir_name, &rel_slash))
}

/// Copy a single file preserving relative structure inside output dir.
fn copy_file(source: &Path, dest: &Path) -> AppResult<u64> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    let copied = fs::copy(source, dest)?;
    Ok(copied as u64)
}

/// Run a backup job (uncancellable convenience wrapper).
pub fn run_backup(job: &BackupJob) -> AppResult<BackupResult> {
    let cancel = AtomicBool::new(false);
    run_backup_cancellable(job, &cancel)
}

/// Run a backup job, aborting early if `cancel` becomes true.
pub fn run_backup_cancellable(job: &BackupJob, cancel: &AtomicBool) -> AppResult<BackupResult> {
    let started_at = chrono::Utc::now().to_rfc3339();
    let mut files_copied: u64 = 0;
    let mut bytes_copied: u64 = 0;
    let mut errors: Vec<String> = Vec::new();
    let mut cancelled = false;

    // Validate output directory.
    if !job.output_path.exists() {
        fs::create_dir_all(&job.output_path)?;
    }

    'sources: for source in &job.source_paths {
        if cancel.load(Ordering::Relaxed) {
            cancelled = true;
            break;
        }
        if !source.exists() {
            errors.push(format!("Source does not exist: {:?}", source));
            continue;
        }

        if source.is_file() {
            // Single file: copy preserving filename.
            let file_name = source
                .file_name()
                .ok_or_else(|| AppError::Backup(format!("Invalid file name: {:?}", source)))?;
            let dest = job.output_path.join(file_name);
            match copy_file(source, &dest) {
                Ok(size) => {
                    files_copied += 1;
                    bytes_copied += size;
                }
                Err(e) => errors.push(format!("Failed to copy {:?}: {}", source, e)),
            }
            continue;
        }

        // Directory: recursive walk. Directories are always descended into
        // (unless explicitly excluded); include masks only filter files.
        let root = source.clone();
        for entry in WalkDir::new(source)
            .into_iter()
            .filter_entry(|e| !(e.file_type().is_dir() && dir_excluded(e.path(), &root, job)))
        {
            if cancel.load(Ordering::Relaxed) {
                cancelled = true;
                break 'sources;
            }
            let entry = match entry {
                Ok(e) => e,
                Err(e) => {
                    errors.push(format!("Walk error: {}", e));
                    continue;
                }
            };

            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            if !file_matches(path, source, job) {
                continue;
            }

            // Compute relative path from source root.
            let rel = match path.strip_prefix(source) {
                Ok(r) => r.to_path_buf(),
                Err(_) => path.to_path_buf(),
            };
            let dest = job.output_path.join(&rel);

            match copy_file(path, &dest) {
                Ok(size) => {
                    files_copied += 1;
                    bytes_copied += size;
                }
                Err(e) => errors.push(format!("Failed to copy {:?}: {}", path, e)),
            }
        }
    }

    let finished_at = chrono::Utc::now().to_rfc3339();

    Ok(BackupResult {
        job_id: job.id.clone(),
        job_name: job.name.clone(),
        started_at,
        finished_at,
        files_copied,
        bytes_copied,
        errors,
        cancelled,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn job(include: &[&str], exclude: &[&str]) -> BackupJob {
        BackupJob {
            include_masks: include.iter().map(|s| s.to_string()).collect(),
            exclude_masks: exclude.iter().map(|s| s.to_string()).collect(),
            ..Default::default()
        }
    }

    #[test]
    fn include_matches_bare_file_name() {
        let j = job(&["*.docx"], &[]);
        assert!(file_matches(Path::new("C:/src/a.docx"), Path::new("C:/src"), &j));
        assert!(!file_matches(Path::new("C:/src/a.png"), Path::new("C:/src"), &j));
    }

    #[test]
    fn include_matches_nested_file_name() {
        let j = job(&["*.docx"], &[]);
        // Old bug: nested files under directories were skipped entirely.
        assert!(file_matches(
            Path::new("C:/src/sub/deep/b.docx"),
            Path::new("C:/src"),
            &j
        ));
    }

    #[test]
    fn include_matches_relative_path() {
        let j = job(&["sub/*.docx"], &[]);
        assert!(file_matches(Path::new("C:/src/sub/b.docx"), Path::new("C:/src"), &j));
        assert!(!file_matches(Path::new("C:/src/other/b.docx"), Path::new("C:/src"), &j));
    }

    #[test]
    fn exclude_takes_precedence() {
        let j = job(&["*"], &["*tmp*"]);
        assert!(!file_matches(Path::new("C:/src/cache.tmp"), Path::new("C:/src"), &j));
        assert!(file_matches(Path::new("C:/src/data.txt"), Path::new("C:/src"), &j));
    }

    #[test]
    fn dir_pruned_by_exclude() {
        let j = job(&[], &["node_modules"]);
        assert!(dir_excluded(Path::new("C:/src/node_modules"), Path::new("C:/src"), &j));
        assert!(!dir_excluded(Path::new("C:/src/src"), Path::new("C:/src"), &j));
    }

    #[test]
    fn empty_masks_allow_all() {
        let j = job(&[], &[]);
        assert!(file_matches(Path::new("C:/src/anything.bin"), Path::new("C:/src"), &j));
    }
}
