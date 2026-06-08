# NT548 - Lab 2 - Câu 3: CI/CD cho ứng dụng microservices Kanban

Ứng dụng Kanban board gồm 3 microservices, được build, test và deploy tự động
bằng GitHub Actions lên Kubernetes (kind), tích hợp SonarCloud (SonarQube
Cloud) kiểm tra chất lượng mã và Trivy quét bảo mật image.

## Kiến trúc ứng dụng

```text
┌──────────────┐      ┌───────────────┐      ┌─────────┐
│   frontend   │ ───► │  task-service │ ───► │  Redis  │
│ Node/Express │      │ Python/Flask  │      └─────────┘
│  UI Kanban   │      │  CRUD tasks   │           ▲
└──────────────┘      └───────────────┘           │
        │             ┌───────────────┐           │
        └───────────► │ stats-service │ ──────────┘
                      │ Python/Flask  │
                      │  thống kê     │
                      └───────────────┘
```

| Service | Stack | Vai trò |
| --- | --- | --- |
| `frontend` | Node.js + Express | Giao diện Kanban (kéo thả 3 cột), proxy API |
| `task-service` | Python + Flask | REST API CRUD task, lưu Redis |
| `stats-service` | Python + Flask | API thống kê số task theo cột |
| `redis` | Redis 7 | Lưu trữ dữ liệu task |

Mỗi service có Dockerfile và unit test riêng (`pytest` cho Python,
`node --test` cho Node).

## Mô hình nhánh (Git Flow) và môi trường

| Nhánh | Môi trường | Namespace | NodePort | Triển khai |
| --- | --- | --- | --- | --- |
| `feature/*` | — | — | — | chỉ CI (test, build thử, Trivy) |
| `develop` | dev | `kanban-dev` | 30080 | tự deploy khi merge |
| `main` | production | `kanban-prod` | 30090 | tự deploy khi merge (main = nhánh release) |
| `hotfix/*` | — | — | — | chỉ CI |

Luồng: `feature/*` → PR vào `develop` → kiểm tra trên dev → PR `develop` vào
`main` → deploy prod. Khi phát hành chính thức thì gắn tag `vX.Y.Z` trên `main`.

## Pipeline (3 workflow + 1 reusable)

```text
.github/workflows/
  _ci-checks.yml   reusable: unit test 3 service + SonarCloud (Quality Gate)
  ci.yml           PR / feature|hotfix push  → checks + build thử + Trivy (KHONG deploy)
  cd.yml           push develop|main          → checks + build+push GHCR + bump overlay
  release.yml      tag v*                      → build image :vX.Y.Z + GitHub Release
```

```text
develop:  PR ─► ci.yml (validate)  ──merge──► cd.yml ─► GHCR :dev-<sha> ─► bump overlays/dev
main:     PR ─► ci.yml (validate)  ──merge──► cd.yml ─► GHCR :<sha>     ─► bump overlays/prod
tag vX.Y.Z ──────────────────────────────────► release.yml ─► GHCR :vX.Y.Z + GitHub Release
                                                          │
                              ┌───────────────────────────┘ (pull-based)
                              ▼
        ArgoCD theo dõi repo: app kanban-dev (nhánh develop) + kanban-prod (nhánh main)
        └── tự sync overlay tương ứng + pull image mới từ GHCR
```

- **ci.yml**: chạy trên PR và nhánh feature/hotfix — test, SonarCloud, build thử
  image + Trivy. Không push image, không deploy. Dùng làm điều kiện merge.
- **cd.yml**: khi merge vào `develop`/`main` — chạy lại checks, build + push image
  lên GHCR, cập nhật `newTag` trong overlay tương ứng rồi commit `[skip ci]`.
- **release.yml**: khi gắn tag `vX.Y.Z` — build image gắn version, tạo GitHub
  Release kèm changelog tự động.
- **ArgoCD**: pull-based, git là nguồn chân lý; mỗi môi trường một Application.

## Tái sử dụng manifests bằng Kustomize

```text
k8s/
  base/                manifest gốc (không gắn namespace/tag)
  overlays/dev/        namespace kanban-dev, 1 replica, NodePort 30080
  overlays/prod/       namespace kanban-prod, 2 replica, NodePort 30090
```

## Chuẩn bị

### 1. Cluster Kubernetes (kind)

```bash
cat <<'EOF' > kind-kanban.yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
name: kanban
nodes:
  - role: control-plane
    extraPortMappings:
      - containerPort: 30080   # dev
        hostPort: 30080
        protocol: TCP
      - containerPort: 30090   # prod
        hostPort: 30090
        protocol: TCP
  - role: worker
EOF
kind create cluster --config kind-kanban.yaml
```

### 2. SonarCloud

1. Đăng nhập <https://sonarcloud.io> bằng tài khoản GitHub, import repo này.
2. Tắt Automatic Analysis (Administration → Analysis Method) để dùng CI.
3. Tạo token (My Account → Security) và thêm vào GitHub repo secret
   `SONAR_TOKEN`.

### 3. ArgoCD (GitOps)

```bash
kubectl create namespace argocd
kubectl apply -n argocd --server-side \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Dang ky 2 ung dung: dev (nhanh develop) va prod (nhanh main)
kubectl apply -f argocd/app-dev.yaml
kubectl apply -f argocd/app-prod.yaml
```

Mở giao diện ArgoCD:

```bash
kubectl -n argocd port-forward svc/argocd-server 8081:443
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 -d   # mat khau cho user admin
```

### 4. Cho phép cluster pull image từ GHCR

Sau lần push image đầu tiên, vào GitHub → Packages → từng package
(`kanban-*`) → **Package settings → Change visibility → Public**.

## Chạy thử local (không cần CI)

```bash
(cd task-service && pip install -r requirements-dev.txt && pytest)
(cd stats-service && pip install -r requirements-dev.txt && pytest)
(cd frontend && npm install && npm test)

for svc in frontend task-service stats-service; do
  docker build -t ghcr.io/nghiant05/kanban-$svc:dev-latest $svc
  kind load docker-image ghcr.io/nghiant05/kanban-$svc:dev-latest --name kanban
done
kubectl apply -k k8s/overlays/dev
```

Mở <http://localhost:30080> (dev) hoặc <http://localhost:30090> (prod).

## Xóa tài nguyên

```bash
kubectl delete namespace kanban-dev kanban-prod
kind delete cluster --name kanban
```
