//! SidebarSplitter — Interactive draggable gutter divider and collapse controller.

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

    const wasCollapsed = localStorage.getItem("aerofoil_sidebar_collapsed") === "true";
    if (wasCollapsed) {
      this.collapse(sidebar);
    }

    splitter.addEventListener("mousedown", (e) => this.onMouseDown(e, sidebar, splitter));
    splitter.addEventListener("dblclick", () => this.toggleCollapse());

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
      this.applyWidth(sidebar, this.startWidth + (this.startX - e.touches[0].clientX));
    });

    window.addEventListener("touchend", () => {
      if (this.isDragging) {
        this.isDragging = false;
        splitter.classList.remove("dragging");
        localStorage.setItem("aerofoil_sidebar_width", this.currentWidth.toString());
      }
    });
  }

  public toggleCollapse(): boolean {
    const sidebar = document.getElementById(this.sidebarId);
    if (!sidebar) return false;
    if (this.isCollapsed) {
      this.expand(sidebar);
    } else {
      this.collapse(sidebar);
    }
    return !this.isCollapsed;
  }

  private collapse(sidebar: HTMLElement): void {
    sidebar.classList.add("hidden");
    document.getElementById(this.splitterId)?.classList.add("collapsed");
    this.isCollapsed = true;
    localStorage.setItem("aerofoil_sidebar_collapsed", "true");
  }

  private expand(sidebar: HTMLElement): void {
    sidebar.style.width = `${this.currentWidth}px`;
    sidebar.classList.remove("hidden");
    document.getElementById(this.splitterId)?.classList.remove("collapsed");
    this.isCollapsed = false;
    localStorage.setItem("aerofoil_sidebar_collapsed", "false");
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
      this.applyWidth(sidebar, this.startWidth + (this.startX - moveEvent.clientX));
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
    const clamped = Math.max(280, Math.min(Math.floor(window.innerWidth * 0.7), newWidth));
    this.currentWidth = clamped;
    sidebar.style.width = `${clamped}px`;
    this.isCollapsed = false;
  }
}
