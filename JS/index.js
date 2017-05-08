jQuery(document).ready(function($) {

	var Page = {
		VM_PAGE: 32,						/*虚页面数，共32*/
		PM_PAGE: 4,							/*物理页面数，共4*/
		TOTAL_INSTR: 320,				/*指令条数，320*/
		INSTR_PER_PAGE: 10,			/*每页指令数*/
		OPT: 1,									/*最佳算法*/
		FIFO: 2,								/*先进先出算法*/
		LRU: 3									/*最近很少使用算法*/
	};

	/**
	 * 页表项数据结构
	 * @param {int} vmn   虚页号
	 * @param {int} pmn   虚页号所对应的实页号
	 * @param {int} exist 存在位，是否已经在物理内存中
	 * @param {int} time  最近访问时间，LRU中用于统计最近访问时间
	 *                    FIFO中用于统计第一次进入物理内存时间
	 */
	function Vage_item(vmn, pmn, exist, time) {
		this.vmn = vmn;
		this.pmn = pmn;
		this.exist = exist;
		this.time = time;
	}

	/**
	 * 每条指令信息
	 * @param {int} num    指令号
	 * @param {int} vpage  所属虚页
	 * @param {int} offset 页内偏移
	 * @param {int} inflow 指令流中是否已包含该指令，用于构建指令流
	 */
	function Instr_item(num, vpage, offset, inflow) {
		this.num = num; 
		this.vpage = vpage; 
		this.offset = offset; 
		this.inflow = inflow; 
	}

	/*pageTable      页表，总数为VM_PAGE*/
	/*ppageBitmap    物理页位图，存放当前正在物理内存中的页表项的指针*/
	/*instrArray     指令数组*/
	/*pfailNum       缺页数*/
	/*curReplaceAlg 当前置换算法，默认为OPT*/
	var pageTable.length = Page.VM_PAGE,			 
			ppageBitmap.length = Page.PM_PAGE,		 
			instrArray.length = Page.TOTAL_INSTR,
			pfailNum = 0,
			curReplaceAlg = 1;

	/**
	 * 数据初始化
	 */
	function initData() {
		var i, 
				j, 
				k;
		//虚页表初始化
		for(i = 0; i < Page.VM_PAGE; i++){
			pageTable.push(new Vage_item(i, 0, 0, -1));
		}
		//物理页位图初始化
		for(i = 0; i < Page.PM_PAGE; i++){
			ppageBitmap[i] = null;			/*没有被使用*/
		}
		//指令数组初始化
		for(i = 0; i < Page.TOTAL_INSTR; i++){
			instrArray.push(new Instr_item(i, i / Page.INSTR_PER_PAGE, i % Page.INSTR_PER_PAGE, 0));
		}

		//指令流头初始化
		iflowHead.num = 0;
		iflowHead.next = null;
		
		pfailNum = 0;
	}

});