//! SidebarSplitter — Interactive draggable gutter divider for telemetry sidebar resizing.

export class SidebarSplitter {
  private isDragging: boolean = false;
  private startX: number = 0;
  private startWidth: number = 420;
  private currentWidth: number = 420;
  private isCollapsed: boolean = false;

  constructor(
    private splitterId: string = "sidebar-splitter",
    private sidebarId: string = "table-container",
  ) {}

  public init(): void {
    const splitter = document.getElementById(this.splitterId);
    const sidebar = document.getElementById(this.sidebarId);
    if (!splitter || !sidebar) return;

    const savedWidth = localStorage.getItem("aerofoil_sidebar_width");
    if (savedWidth) {
      const parsed = parseInt(savedWidth, 10);
      if (!isNaN(parsed) && parsed >= 260 && parsed <= window.innerWidth * 0.8) {
        this.currentWidth = parsed;
        sidebar.style.width = `${parsed}px`;
      }
    }

    splitter.addEventListener("mousedown", (e) => this.onMouseDown(e, sidebar, splitter));
    splitter.addEventListener("dblclick", () => this.toggleCollapse(sidebar));

    // Touch support for tablets / touch screens
    splitter.addEventListener("touchstart", (e) => {
      if (e.touches.length === 1) {
        this.isDragging = true;
        this.startX = e.touches[0].clientX;
        this.startWidth = sidebar.getBoundingClientRect().width;
        splitter.classList.add("dragging");
      }
    });

    window.addEventListener("touchmove", (e) => {
      if (!this.isDragging || e.touches.length !== 1) return;
      const dx = this.startX - e.touches[0].clientX;
      this.applyWidth(sidebar, this.startWidth + dx);
    });

    window.addEventListener("touchend", () => {
      if (this.isDragging) {
        this.isDragging = false;
        splitter.classList.remove("dragging");
        localStorage.setItem("aerofoil_sidebar_width", this.currentWidth.toString());
      }
    });
  }

  private onMouseDown(e: MouseEvent, sidebar: HTMLElement, splitter: HTMLElement): void {
    e.preventDefault();
    this.isDragging = true;
    this.startX = e.clientX;
    this.startWidth = sidebar.getBoundingClientRect().width;
    splitter.classList.add("dragging");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!this.isDragging) return;
      const dx = this.startX - moveEvent.clientX;
      this.applyWidth(sidebar, this.startWidth + dx);
    };

    const onMouseUp = () => {
      if (this.isDragging) {
        this.isDragging = false;
        splitter.classList.remove("dragging");
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        localStorage.setItem("aerofoil_sidebar_width", this.currentWidth.toString());
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  private applyWidth(sidebar: HTMLElement, newWidth: number): void {
    const minWidth = 280;
    const maxWidth = Math.floor(window.innerWidth * 0.7);
    const clamped = Math.max(minWidth, Math.min(maxWidth, newWidth));
    this.currentWidth = clamped;
    sidebar.style.width = `${clamped}px`;
    this.isCollapsed = false;
  }

  private toggleCollapse(sidebar: HTMLElement): void {
    if (this.isCollapsed) {
      sidebar.style.width = `${this.currentWidth}px`;
      sidebar.classList.remove("hidden");
      this.isCollapsed = false;
    } else {
      sidebar.classList.add("hidden");
      this.isCollapsed = true;
    }
  }
}
